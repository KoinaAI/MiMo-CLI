import { CodingAgent } from '../agent/agent.js';
import {
  appendSessionMessages,
  createSession,
  readSession,
  saveSession,
} from '../session/store.js';
import type {
  AgentEvent,
  AgentOptions,
  AgentRunCallbacks,
  ChatMessage,
  RuntimeConfig,
  SessionRecord,
  ToolApprovalDecision,
  ToolCall,
  ToolDefinition,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import type { StreamEvent } from './types.js';

export interface ActiveRun {
  runId: string;
  sessionId: string;
  controller: AbortController;
  approvals: Map<string, (decision: ToolApprovalDecision) => void>;
  alwaysApprove: Set<string>;
  emit(event: StreamEvent): void;
}

export interface RunnerStartArgs {
  sessionId: string;
  message: string;
  config: RuntimeConfig;
  tools: ToolDefinition[];
  options: AgentOptions;
  emit(event: StreamEvent): void;
  onSession?(session: SessionRecord): void;
}

export class WebRunner {
  private readonly runs = new Map<string, ActiveRun>();

  list(): ActiveRun[] {
    return [...this.runs.values()];
  }

  get(runId: string): ActiveRun | undefined {
    return this.runs.get(runId);
  }

  cancel(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    run.controller.abort();
    return true;
  }

  approve(runId: string, approvalId: string, decision: ToolApprovalDecision): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    const resolver = run.approvals.get(approvalId);
    if (!resolver) return false;
    run.approvals.delete(approvalId);
    resolver(decision);
    return true;
  }

  /**
   * Start a new agent run for `sessionId`. Returns the runId immediately and
   * runs the agent in the background, streaming events through `emit`.
   */
  async start(args: RunnerStartArgs): Promise<string> {
    const runId = generateRunId();
    const controller = new AbortController();
    const approvals = new Map<string, (decision: ToolApprovalDecision) => void>();
    const alwaysApprove = new Set<string>();
    const run: ActiveRun = {
      runId,
      sessionId: args.sessionId,
      controller,
      approvals,
      alwaysApprove,
      emit: args.emit,
    };
    this.runs.set(runId, run);

    args.emit({ type: 'run_started', runId, sessionId: args.sessionId });

    void this.executeRun(args, run).catch((error: unknown) => {
      args.emit({ type: 'error', message: errorMessage(error), runId });
    }).finally(() => {
      this.runs.delete(runId);
      args.emit({ type: 'run_finished', runId, sessionId: args.sessionId });
    });

    return runId;
  }

  private async executeRun(args: RunnerStartArgs, run: ActiveRun): Promise<void> {
    const session = await loadOrCreateSession(args.sessionId, args.options.cwd);
    const userMessage: ChatMessage = { role: 'user', content: args.message };
    const collected: ChatMessage[] = [userMessage];
    let lastAssistantThinking: string | undefined;

    const agent = new CodingAgent(args.config, args.tools, args.options);
    const callbacks: AgentRunCallbacks = {
      signal: run.controller.signal,
      approveToolCall: (toolCall: ToolCall, tool: ToolDefinition) => {
        return this.requestApproval(run, toolCall, tool, args.options.autoApprove);
      },
      onEvent: (event: AgentEvent) => {
        run.emit({ ...event, runId: run.runId });
        if (event.type === 'assistant_thinking') {
          lastAssistantThinking = event.content;
        }
        if (event.type === 'assistant_message') {
          collected.push({
            role: 'assistant',
            content: event.content,
            ...(lastAssistantThinking ? { thinking: lastAssistantThinking } : {}),
          });
          lastAssistantThinking = undefined;
        } else if (event.type === 'tool_call') {
          collected.push({
            role: 'assistant',
            content: '',
            toolCalls: [{ id: event.id, name: event.name, input: event.input }],
          });
        } else if (event.type === 'tool_result' || event.type === 'tool_blocked') {
          collected.push({
            role: 'tool',
            toolCallId: event.id,
            name: event.name,
            content: event.type === 'tool_blocked' ? `Blocked: ${event.reason}` : event.content,
          });
        }
      },
    };

    try {
      await agent.run(args.message, callbacks, session.messages);
    } finally {
      const updated = appendSessionMessages(session, collected);
      const final = updated.messages.length > 0 && updated.title === 'New chat'
        ? { ...updated, title: deriveTitle(args.message) }
        : updated;
      await saveSession(final);
      run.emit({
        type: 'session_updated',
        sessionId: final.id,
        messageCount: final.messages.length,
        updatedAt: new Date().toISOString(),
        title: final.title,
      });
      args.onSession?.(final);
    }
  }

  private requestApproval(
    run: ActiveRun,
    toolCall: ToolCall,
    tool: ToolDefinition,
    autoApprove: boolean,
  ): Promise<ToolApprovalDecision> {
    if (autoApprove || tool.readOnly) return Promise.resolve('approve');
    if (run.alwaysApprove.has(tool.name)) return Promise.resolve('approve');
    return new Promise<ToolApprovalDecision>((resolve) => {
      const approvalId = generateRunId();
      run.approvals.set(approvalId, (decision) => {
        if (decision === 'always') run.alwaysApprove.add(tool.name);
        resolve(decision === 'always' ? 'approve' : decision);
      });
      run.emit({
        type: 'approval_required',
        runId: run.runId,
        approvalId,
        toolCall: { id: toolCall.id, name: toolCall.name, input: toolCall.input },
      });
    });
  }
}

async function loadOrCreateSession(sessionId: string, cwd: string): Promise<SessionRecord> {
  try {
    return await readSession(sessionId);
  } catch {
    const session = createSession('New chat', cwd);
    return { ...session, id: sessionId };
  }
}

function deriveTitle(message: string): string {
  const firstLine = message.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) return 'New chat';
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 57)}…`;
}

function generateRunId(): string {
  return crypto.randomUUID();
}
