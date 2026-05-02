import { MiMoClient } from '../api/client.js';
import { runHooks } from '../hooks.js';
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
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
import { mergeUsage } from './usage.js';

export class CodingAgent {
  private readonly client: MiMoClient;
  private readonly systemPrompt: string;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly tools: ToolDefinition[],
    private readonly options: AgentOptions,
  ) {
    this.systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.client = new MiMoClient({ ...this.config, systemPrompt: this.systemPrompt });
  }

  async run(task: string, callbacks: AgentRunCallbacks = {}, history: ChatMessage[] = []): Promise<AgentResult> {
    const skillContext = await buildSkillContext(this.config.skills, this.options.cwd);
    await runHooks(this.config.hooks, 'user_prompt', { cwd: this.options.cwd, prompt: task });
    const systemPrompt = this.systemPrompt;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages(this.config, skillContext),
      ...history,
      { role: 'user', content: task },
    ];
    let finalMessage = '';
    let usage: TokenUsage = {};

    for (let iteration = 1; iteration <= this.options.maxIterations; iteration += 1) {
      emit(callbacks, { type: 'thinking', iteration, maxIterations: this.options.maxIterations });
      const response = await this.client.complete(messages, this.tools).catch((error: unknown) => {
        const message = errorMessage(error);
        emit(callbacks, { type: 'error', message });
        throw error;
      });
      usage = mergeUsage(usage, response.rawUsage);

      if (response.content) {
        finalMessage = response.content;
        emit(callbacks, { type: 'assistant_message', content: response.content.trim() });
      }

      if (response.toolCalls.length === 0) {
        const result = { finalMessage, iterations: iteration, usage };
        await runHooks(this.config.hooks, 'agent_done', { cwd: this.options.cwd, prompt: task, finalMessage: result.finalMessage });
        emit(callbacks, { type: 'done', result });
        return result;
      }

      messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });

      for (const toolCall of response.toolCalls) {
        const tool = this.tools.find((candidate) => candidate.name === toolCall.name);
        if (!tool) {
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: toolCall.name, content: `Unknown tool: ${toolCall.name}` });
          continue;
        }
        emit(callbacks, { type: 'tool_call', id: toolCall.id, name: toolCall.name, input: toolCall.input });
        const approval = await approveToolCall(toolCall, tool, callbacks, this.options.autoApprove);
        if (approval === 'deny') {
          const content = `Tool call denied by user: ${toolCall.name}`;
          emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content });
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content });
          continue;
        }
        await runHooks(this.config.hooks, 'before_tool', { cwd: this.options.cwd, prompt: task, toolName: tool.name, toolInput: toolCall.input });
        const content = await tool.run(toolCall.input, this.options).catch((error: unknown) => `Tool error: ${errorMessage(error)}`);
        await runHooks(this.config.hooks, 'after_tool', {
          cwd: this.options.cwd,
          prompt: task,
          toolName: tool.name,
          toolInput: toolCall.input,
          toolOutput: content,
        });
        emit(callbacks, { type: 'tool_result', id: toolCall.id, name: tool.name, content });
        messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content });
      }
    }

    const message = `Stopped after ${this.options.maxIterations} iterations. Ask a more focused question or increase --max-iterations.`;
    const result = { finalMessage: finalMessage || message, iterations: this.options.maxIterations, usage };
    await runHooks(this.config.hooks, 'agent_done', { cwd: this.options.cwd, prompt: task, finalMessage: result.finalMessage });
    emit(callbacks, { type: 'done', result });
    return result;
  }

}

function contextMessages(config: RuntimeConfig, skillContext: string): ChatMessage[] {
  const context: string[] = [];
  if (config.mcpServers && config.mcpServers.length > 0) {
    context.push(`Configured MCP servers:\\n${JSON.stringify(config.mcpServers.filter((server) => server.enabled !== false), null, 2)}`);
  }
  if (skillContext) context.push(`Loaded skills:\\n${skillContext}`);
  return context.length > 0 ? [{ role: 'system', content: context.join('\\n\\n') }] : [];
}

async function approveToolCall(
  toolCall: ToolCall,
  tool: ToolDefinition,
  callbacks: AgentRunCallbacks,
  autoApprove: boolean,
): Promise<'approve' | 'deny'> {
  if (autoApprove || !isMutatingTool(tool.name) || !callbacks.approveToolCall) {
    return 'approve';
  }
  const decision = await callbacks.approveToolCall(toolCall, tool);
  return decision === 'deny' ? 'deny' : 'approve';
}

function isMutatingTool(toolName: string): boolean {
  return toolName === 'write_file' || toolName === 'edit_file' || toolName === 'run_shell';
}

function emit(callbacks: AgentRunCallbacks, event: AgentEvent): void {
  callbacks.onEvent?.(event);
}
