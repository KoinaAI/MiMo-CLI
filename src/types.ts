export type ApiFormat = 'openai' | 'anthropic';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  thinking?: string | undefined;
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
  thinking?: string | undefined;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type InteractionMode = 'plan' | 'agent' | 'yolo';

export interface RuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  format: ApiFormat;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  mcpServers?: McpServerConfig[];
  skills?: SkillConfig[];
  hooks?: HookConfig[];
}

export interface PersistedConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  format?: ApiFormat;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  mcpServers?: McpServerConfig[];
  skills?: SkillConfig[];
  hooks?: HookConfig[];
}

export interface AgentOptions {
  cwd: string;
  dryRun: boolean;
  maxIterations: number;
  autoApprove: boolean;
  mode?: InteractionMode | undefined;
}

export interface AgentResult {
  finalMessage: string;
  iterations: number;
  usage: TokenUsage;
  cost?: CostEstimate | undefined;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface ToolContext {
  cwd: string;
  dryRun: boolean;
  autoApprove: boolean;
  mode?: InteractionMode | undefined;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean | undefined;
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>;
}

export type AgentEvent =
  | { type: 'thinking'; iteration: number; maxIterations: number }
  | { type: 'assistant_message'; content: string }
  | { type: 'assistant_thinking'; content: string }
  | { type: 'streaming_delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; result: AgentResult };

export type ToolApprovalDecision = 'approve' | 'deny' | 'always';

export interface AgentRunCallbacks {
  onEvent?(event: AgentEvent): void;
  approveToolCall?(toolCall: ToolCall, tool: ToolDefinition): Promise<ToolApprovalDecision>;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface SkillConfig {
  name: string;
  path?: string;
  description?: string;
  enabled?: boolean;
}

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type HookEvent = 'session_start' | 'user_prompt' | 'before_tool' | 'after_tool' | 'agent_done';

export interface HookConfig {
  name: string;
  event: HookEvent;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface HookPayload {
  cwd: string;
  prompt?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  finalMessage?: string;
}

export interface MemoryNote {
  id: string;
  content: string;
  createdAt: string;
  scope: 'project' | 'global';
}

export interface SubAgentConfig {
  task: string;
  tools: ToolDefinition[];
  maxIterations?: number;
}

export type ExecutionPolicyLevel = 'strict' | 'normal' | 'permissive';

export interface ExecutionPolicy {
  level: ExecutionPolicyLevel;
  allowedTools?: string[];
  blockedTools?: string[];
  requireApproval?: string[];
}
