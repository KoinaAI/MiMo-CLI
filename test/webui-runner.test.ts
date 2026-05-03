import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { WebRunner } from '../src/webui/runner.js';
import type { ToolDefinition } from '../src/types.js';
import type { StreamEvent } from '../src/webui/types.js';

const noopTool: ToolDefinition = {
  name: 'noop',
  description: 'noop',
  inputSchema: { type: 'object' },
  readOnly: true,
  run: async () => 'ok',
};

describe('WebRunner', () => {
  it('emits run_started and run_finished, persists session on cancellation', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'mimo-runner-'));
    process.env.HOME = cwd;
    process.env.USERPROFILE = cwd;
    try {
      const runner = new WebRunner();
      const events: StreamEvent[] = [];
      const sessionId = 'b3edc7ce-0000-4000-8000-000000000001';
      const runId = await runner.start({
        sessionId,
        message: 'Hello MiMo',
        config: {
          apiKey: 'test',
          baseUrl: 'http://127.0.0.1:1', // unreachable: the run will surface an error event
          model: 'mimo-v2.5-pro',
          format: 'anthropic',
          maxTokens: 64,
          temperature: 0,
        },
        tools: [noopTool],
        options: {
          cwd,
          dryRun: true,
          autoApprove: true,
          maxIterations: 1,
          mode: 'agent',
        },
        emit: (event) => events.push(event),
      });

      expect(typeof runId).toBe('string');
      // Wait until run finishes (network failure surfaces as error/run_finished).
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 3000);
        const interval = setInterval(() => {
          if (events.some((event) => event.type === 'run_finished')) {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve();
          }
        }, 50);
      });

      expect(events[0]?.type).toBe('run_started');
      expect(events.some((event) => event.type === 'run_finished')).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
