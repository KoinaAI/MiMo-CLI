import { MiMoClient } from '../api/client.js';
import { discoverProjectContext, buildProjectContextPrompt } from '../context/project.js';
import { runHooks, wasCancelled, type HookRunResult } from '../hooks.js';
import { defaultSandboxForMode, isToolAllowed } from '../policy/sandbox.js';
import { buildSkillContext } from '../skills/loader.js';
import type {
  AgentEvent,
  AgentOptions,
  AgentResult,
  AgentRunCallbacks,
  ChatMessage,
  RuntimeConfig,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import { logToolCall, logToolResult, logSessionEvent } from './audit.js';
import { DEFAULT_SYSTEM_PROMPT, PLAN_MODE_SYSTEM_PROMPT, YOLO_MODE_SYSTEM_PROMPT } from './prompt.js';
import { estimateCost, mergeUsage } from './usage.js';

export class CodingAgent {
  private readonly client: MiMoClient;
  private readonly systemPrompt: string;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly tools: ToolDefinition[],
    private readonly options: AgentOptions,
  ) {
    this.systemPrompt = this.resolveSystemPrompt();
    this.client = new MiMoClient({ ...this.config, systemPrompt: this.systemPrompt });
  }

  private resolveSystemPrompt(): string {
    if (this.config.systemPrompt) return this.config.systemPrompt;
    const mode = this.options.mode ?? 'agent';
    if (mode === 'plan') return PLAN_MODE_SYSTEM_PROMPT;
    if (mode === 'yolo') return YOLO_MODE_SYSTEM_PROMPT;
    return DEFAULT_SYSTEM_PROMPT;
  }

  private filterToolsForMode(): ToolDefinition[] {
    const mode = this.options.mode ?? 'agent';
    if (mode === 'plan') {
      return this.tools.filter((tool) => tool.readOnly === true);
    }
    return this.tools;
  }

  async run(task: string, callbacks: AgentRunCallbacks = {}, history: ChatMessage[] = []): Promise<AgentResult> {
    const sessionId = crypto.randomUUID().slice(0, 8);
    void logSessionEvent(sessionId, 'session_start', `task: ${task.slice(0, 200)}`);

    const skillContext = await buildSkillContext(this.config.skills, this.options.cwd, task);
    const projectContexts = await discoverProjectContext(this.options.cwd);
    const projectContextPrompt = buildProjectContextPrompt(projectContexts);
    emitHookResults(callbacks, await runHooks(this.config.hooks, 'user_prompt', { cwd: this.options.cwd, prompt: task }));
    const systemPrompt = this.systemPrompt;
    const activeTools = this.filterToolsForMode();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages(this.config, skillContext, projectContextPrompt),
      ...history,
      { role: 'user', content: task },
    ];
    let finalMessage = '';
    let usage: TokenUsage = {};

    for (let iteration = 1; iteration <= this.options.maxIterations; iteration += 1) {
      if (callbacks.signal?.aborted) {
        const result = interruptedResult(this.config.model, usage, iteration);
        emitHookResults(callbacks, await runHooks(this.config.hooks, 'stop', { cwd: this.options.cwd, prompt: task, reason: 'aborted' }));
        emit(callbacks, { type: 'done', result });
        return result;
      }
      emit(callbacks, { type: 'thinking', iteration, maxIterations: this.options.maxIterations });

      const response = await this.client.completeStreaming(messages, activeTools, {
        onDelta: (delta) => emit(callbacks, { type: 'streaming_delta', content: delta }),
        onThinking: (text) => emit(callbacks, { type: 'assistant_thinking', content: text }),
      }).catch((error: unknown) => {
        const message = errorMessage(error);
        emit(callbacks, { type: 'error', message });
        throw error;
      });
      usage = mergeUsage(usage, response.rawUsage);

      if (response.thinking) {
        emit(callbacks, { type: 'assistant_thinking', content: response.thinking });
      }

      if (response.content) {
        finalMessage = response.content;
        emit(callbacks, { type: 'assistant_message', content: response.content.trim() });
      }

      if (response.toolCalls.length === 0) {
        const cost = estimateCost(this.config.model, usage);
        const result = { finalMessage, iterations: iteration, usage, cost };
        await runHooks(this.config.hooks, 'agent_done', { cwd: this.options.cwd, prompt: task, finalMessage: result.finalMessage });
        emit(callbacks, { type: 'done', result });
        return result;
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
        thinking: response.thinking,
      });

      for (const toolCall of response.toolCalls) {
        if (callbacks.signal?.aborted) {
          const result = interruptedResult(this.config.model, usage, iteration);
          emitHookResults(callbacks, await runHooks(this.config.hooks, 'stop', { cwd: this.options.cwd, prompt: task, reason: 'aborted' }));
          emit(callbacks, { type: 'done', result });
          return result;
        }
        const tool = activeTools.find((candidate) => candidate.name === toolCall.name);
        if (!tool) {
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: toolCall.name, content: `Unknown tool: ${toolCall.name}` });
          continue;
        }
        emit(callbacks, { type: 'tool_call', id: toolCall.id, name: toolCall.name, input: toolCall.input });
        void logToolCall(sessionId, toolCall.name, toolCall.input);
        const sandbox = this.options.sandbox ?? defaultSandboxForMode(this.options.mode ?? 'agent');
        const sandboxDecision = isToolAllowed(sandbox, tool, toolCall.input, this.options.cwd);
        if (!sandboxDecision.allowed) {
          const blocked = `Sandbox blocked: ${sandboxDecision.reason}`;
          emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content: blocked });
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content: blocked });
          continue;
        }
        const approval = await approveToolCall(toolCall, tool, callbacks, this.options);
        if (approval === 'deny') {
          const content = `Tool call denied by user: ${toolCall.name}`;
          emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content });
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content });
          continue;
        }
        const beforeResults = await runHooks(this.config.hooks, 'before_tool', { cwd: this.options.cwd, prompt: task, toolName: tool.name, toolInput: toolCall.input });
        emitHookResults(callbacks, beforeResults);
        const preResults = await runHooks(this.config.hooks, 'pre_tool_use', { cwd: this.options.cwd, prompt: task, toolName: tool.name, toolInput: toolCall.input });
        emitHookResults(callbacks, preResults);
        if (wasCancelled(beforeResults) || wasCancelled(preResults)) {
          const blockedContent = `Tool call '${tool.name}' blocked by hook (exit code 2).`;
          emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content: blockedContent });
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content: blockedContent });
          continue;
        }
        const content = await tool.run(toolCall.input, this.options).catch((error: unknown) => `Tool error: ${errorMessage(error)}`);
        void logToolResult(sessionId, tool.name, content);
        const afterResults = await runHooks(this.config.hooks, 'after_tool', {
          cwd: this.options.cwd,
          prompt: task,
          toolName: tool.name,
          toolInput: toolCall.input,
          toolOutput: content,
        });
        emitHookResults(callbacks, afterResults);
        const postResults = await runHooks(this.config.hooks, 'post_tool_use', {
          cwd: this.options.cwd,
          prompt: task,
          toolName: tool.name,
          toolInput: toolCall.input,
          toolOutput: content,
        });
        emitHookResults(callbacks, postResults);
        emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content });
        messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content });
      }
    }

    const message = `Stopped after ${this.options.maxIterations} iterations. Ask a more focused question or increase --max-iterations.`;
    const cost = estimateCost(this.config.model, usage);
    const result = { finalMessage: finalMessage || message, iterations: this.options.maxIterations, usage, cost };
    await runHooks(this.config.hooks, 'agent_done', { cwd: this.options.cwd, prompt: task, finalMessage: result.finalMessage });
    emit(callbacks, { type: 'done', result });
    return result;
  }

}

function contextMessages(config: RuntimeConfig, skillContext: string, projectContext?: string): ChatMessage[] {
  const context: string[] = [];
  if (projectContext) context.push(projectContext);
  if (config.mcpServers && config.mcpServers.length > 0) {
    context.push(`Configured MCP servers:\\n${JSON.stringify(config.mcpServers.filter((server) => server.enabled !== false), null, 2)}`);
  }
  if (skillContext) context.push(`Loaded skills:\\n${skillContext}`);
  if (context.length === 0) return [];
  return [{ role: 'system', content: context.join('\n\n') }];
}

async function approveToolCall(toolCall: ToolCall, tool: ToolDefinition, callbacks: AgentRunCallbacks, options: AgentOptions): Promise<'approve' | 'deny'> {
  const mode = options.mode ?? 'agent';
  if (mode === 'yolo' || options.autoApprove) return 'approve';
  if (tool.readOnly) return 'approve';
  if (!callbacks.approveToolCall) return 'approve';
  const decision = await callbacks.approveToolCall(toolCall, tool);
  return decision === 'deny' ? 'deny' : 'approve';
}

function emit(callbacks: AgentRunCallbacks, event: AgentEvent): void {
  callbacks.onEvent?.(event);
}

function interruptedResult(model: string, usage: TokenUsage, iteration: number): AgentResult {
  return {
    finalMessage: 'Interrupted by user.',
    iterations: iteration,
    usage,
    cost: estimateCost(model, usage),
  };
}

function emitHookResults(callbacks: AgentRunCallbacks, results: HookRunResult[]): void {
  for (const result of results) {
    if (result.code === 0 && !result.output.trim()) continue;
    emit(callbacks, {
      type: 'hook_result',
      event: result.event,
      hook: result.hook,
      code: result.code,
      output: result.output.trim(),
      cancelled: result.cancelled,
    });
  }
}
