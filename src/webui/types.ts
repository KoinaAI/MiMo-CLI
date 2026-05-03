import type { AgentEvent, InteractionMode, SandboxLevel } from '../types.js';

export interface WebUIServerOptions {
  cwd: string;
  host: string;
  port: number;
  open: boolean;
  mode: InteractionMode;
  sandbox?: SandboxLevel | undefined;
  dryRun: boolean;
  autoApprove: boolean;
  maxIterations: number;
  noBrowser: boolean;
  staticDir?: string | undefined;
}

export interface ServerInfo {
  version: string;
  cwd: string;
  model: string;
  baseUrl: string;
  mode: InteractionMode;
  sandbox: SandboxLevel;
  dryRun: boolean;
  autoApprove: boolean;
  maxIterations: number;
  models: string[];
  modes: InteractionMode[];
  sandboxLevels: SandboxLevel[];
  toolNames: string[];
  apiKeyConfigured: boolean;
  workspaceWritable: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export type StreamEvent =
  | (AgentEvent & { runId: string })
  | { type: 'run_started'; runId: string; sessionId: string }
  | { type: 'run_finished'; runId: string; sessionId: string }
  | { type: 'session_updated'; sessionId: string; messageCount: number; updatedAt: string; title: string }
  | { type: 'approval_required'; runId: string; approvalId: string; toolCall: { id: string; name: string; input: Record<string, unknown> } }
  | { type: 'pong'; runId: string };

export interface ApprovalRequest {
  runId: string;
  approvalId: string;
  decision: 'approve' | 'deny' | 'always';
}
