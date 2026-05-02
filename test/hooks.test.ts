import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHooks } from '../src/hooks.js';

describe('runHooks', () => {
  it('runs enabled hooks for matching events', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-'));
    const results = await runHooks(
      [{ name: 'echo', event: 'user_prompt', command: 'node', args: ['-e', 'process.stdout.write(process.env.MIMO_HOOK_EVENT ?? "")'] }],
      'user_prompt',
      { cwd, prompt: 'hello' },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.output).toBe('user_prompt');
  });
});
