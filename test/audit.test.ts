import { describe, expect, it } from 'vitest';
import { writeAuditLog, logToolCall, logToolResult, logSessionEvent, logError } from '../src/agent/audit.js';

describe('audit logging', () => {
  it('writes audit log entry without throwing', async () => {
    await expect(
      writeAuditLog({
        timestamp: new Date().toISOString(),
        sessionId: 'test-1234',
        action: 'tool_call',
        detail: 'read_file(path=test.ts)',
      }),
    ).resolves.toBeUndefined();
  });

  it('logs tool call', async () => {
    await expect(logToolCall('test-id', 'read_file', { path: 'foo.ts' })).resolves.toBeUndefined();
  });

  it('logs tool result', async () => {
    await expect(logToolResult('test-id', 'read_file', 'file content here')).resolves.toBeUndefined();
  });

  it('logs session event', async () => {
    await expect(logSessionEvent('test-id', 'session_start', 'test session')).resolves.toBeUndefined();
  });

  it('logs error', async () => {
    await expect(logError('test-id', 'something went wrong')).resolves.toBeUndefined();
  });
});
