export type ApiFormat = 'openai' | 'anthropic';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantResponse {
  content: string;
  toolCalls: ToolCall[];
  rawUsage?: TokenUsage | undefined;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface RuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  format: ApiFormat;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
}

export interface PersistedConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  format?: ApiFormat;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AgentOptions {
  cwd: string;
  dryRun: boolean;
  maxIterations: number;
  autoApprove: boolean;
}

export interface AgentResult {
  finalMessage: string;
  iterations: number;
  usage: TokenUsage;
}

export interface ToolContext {
  cwd: string;
  dryRun: boolean;
  autoApprove: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>;
}

export type AgentEvent =
  | { type: 'thinking'; iteration: number; maxIterations: number }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; result: AgentResult };

export type ToolApprovalDecision = 'approve' | 'deny' | 'always';

export interface AgentRunCallbacks {
  onEvent?(event: AgentEvent): void;
  approveToolCall?(toolCall: ToolCall, tool: ToolDefinition): Promise<ToolApprovalDecision>;
}
