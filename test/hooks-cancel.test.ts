import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHooks, wasCancelled } from '../src/hooks.js';

describe('hooks cancel semantics', () => {
  it('marks a hook as cancelled when it exits with code 2', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-cancel-'));
    const results = await runHooks(
      [{ name: 'block', event: 'pre_tool_use', command: 'node', args: ['-e', 'process.exit(2)'] }],
      'pre_tool_use',
      { cwd, toolName: 'run_shell' },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.cancelled).toBe(true);
    expect(wasCancelled(results)).toBe(true);
  });

  it('does not mark hooks as cancelled for non-2 exit codes', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-soft-'));
    const results = await runHooks(
      [{ name: 'warn', event: 'pre_tool_use', command: 'node', args: ['-e', 'process.exit(1)'] }],
      'pre_tool_use',
      { cwd },
    );
    expect(results[0]?.cancelled).toBe(false);
    expect(wasCancelled(results)).toBe(false);
  });

  it('respects matcher filtering', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-matcher-'));
    const results = await runHooks(
      [
        { name: 'shell-only', event: 'pre_tool_use', matcher: 'run_shell', command: 'node', args: ['-e', 'process.exit(2)'] },
        { name: 'always', event: 'pre_tool_use', matcher: '*', command: 'node', args: ['-e', 'process.exit(0)'] },
      ],
      'pre_tool_use',
      { cwd, toolName: 'read_file' },
    );
    // shell-only should be filtered out by matcher; only the wildcard runs.
    expect(results).toHaveLength(1);
    expect(results[0]?.hook).toBe('always');
  });

  it('supports allow and block tool filters', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-filters-'));
    const results = await runHooks(
      [
        { name: 'write-only', event: 'pre_tool_use', allowTools: ['write_*'], command: 'node', args: ['-e', 'process.exit(0)'] },
        { name: 'not-shell', event: 'pre_tool_use', blockTools: ['run_shell'], command: 'node', args: ['-e', 'process.exit(0)'] },
      ],
      'pre_tool_use',
      { cwd, toolName: 'write_file' },
    );
    expect(results.map((result) => result.hook)).toEqual(['write-only', 'not-shell']);
  });

  it('stops later hooks after cancellation by default', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-hooks-stop-'));
    const results = await runHooks(
      [
        { name: 'block', event: 'pre_tool_use', command: 'node', args: ['-e', 'process.exit(2)'] },
        { name: 'later', event: 'pre_tool_use', command: 'node', args: ['-e', 'process.exit(0)'] },
      ],
      'pre_tool_use',
      { cwd, toolName: 'run_shell' },
    );
    expect(results.map((result) => result.hook)).toEqual(['block']);
  });
});
