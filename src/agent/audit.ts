import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const AUDIT_DIR = path.join(os.homedir(), '.mimo-code', 'audit');
const MAX_LINE_LENGTH = 2000;

export type AuditAction = 'tool_call' | 'tool_result' | 'api_call' | 'approval' | 'error' | 'session_start' | 'session_end';

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  action: AuditAction;
  detail: string;
}

/**
 * Append a single audit log entry. Best-effort: write failures are ignored.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    const logFile = path.join(AUDIT_DIR, `${date}.log`);
    let line = `${entry.timestamp} [${entry.sessionId}] ${entry.action}: ${entry.detail}`;
    if (line.length > MAX_LINE_LENGTH) line = line.slice(0, MAX_LINE_LENGTH) + '…';
    await appendFile(logFile, line + '\n', 'utf8');
  } catch {
    // Best-effort logging — never throw
  }
}

/**
 * Log a tool call invocation.
 */
export function logToolCall(sessionId: string, toolName: string, input: Record<string, unknown>): Promise<void> {
  return writeAuditLog({
    timestamp: new Date().toISOString(),
    sessionId,
    action: 'tool_call',
    detail: `${toolName}(${JSON.stringify(input).slice(0, 500)})`,
  });
}

/**
 * Log a tool result.
 */
export function logToolResult(sessionId: string, toolName: string, output: string): Promise<void> {
  return writeAuditLog({
    timestamp: new Date().toISOString(),
    sessionId,
    action: 'tool_result',
    detail: `${toolName} → ${output.slice(0, 500)}`,
  });
}

/**
 * Log a session lifecycle event.
 */
export function logSessionEvent(sessionId: string, action: 'session_start' | 'session_end', detail: string): Promise<void> {
  return writeAuditLog({
    timestamp: new Date().toISOString(),
    sessionId,
    action,
    detail,
  });
}

/**
 * Log an error.
 */
export function logError(sessionId: string, error: string): Promise<void> {
  return writeAuditLog({
    timestamp: new Date().toISOString(),
    sessionId,
    action: 'error',
    detail: error,
  });
}
