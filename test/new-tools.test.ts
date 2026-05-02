import { describe, expect, it } from 'vitest';
import { gitStatusTool, gitLogTool, gitDiffTool } from '../src/tools/git.js';
import { fileSearchTool } from '../src/tools/file-search.js';
import { todoAddTool, todoUpdateTool, todoListTool, resetTodoStore } from '../src/tools/todo.js';
import { webFetchTool } from '../src/tools/web.js';
import type { ToolContext } from '../src/types.js';

const ctx: ToolContext = { cwd: process.cwd(), dryRun: false, autoApprove: true };

describe('git tools', () => {
  it('gitStatusTool is read-only', () => {
    expect(gitStatusTool.readOnly).toBe(true);
  });

  it('gitLogTool is read-only', () => {
    expect(gitLogTool.readOnly).toBe(true);
  });

  it('gitDiffTool is read-only', () => {
    expect(gitDiffTool.readOnly).toBe(true);
  });

  it('gitStatusTool returns output', async () => {
    const result = await gitStatusTool.run({}, ctx);
    expect(typeof result).toBe('string');
  });

  it('gitLogTool returns output', async () => {
    const result = await gitLogTool.run({}, ctx);
    expect(typeof result).toBe('string');
  });
});

describe('file search tool', () => {
  it('finds files by pattern', async () => {
    const result = await fileSearchTool.run({ pattern: 'package.json' }, ctx);
    expect(result).toContain('package.json');
  });

  it('returns no results for unknown patterns', async () => {
    const result = await fileSearchTool.run({ pattern: 'xyznonexistent123456' }, ctx);
    expect(result).toContain('No matching files');
  });
});

describe('todo tools', () => {
  it('adds, lists, and updates tasks', async () => {
    resetTodoStore();
    const addResult = await todoAddTool.run({ text: 'Test task 1' }, ctx);
    expect(addResult).toContain('Test task 1');

    const listResult = await todoListTool.run({}, ctx);
    expect(listResult).toContain('Test task 1');
    expect(listResult).toContain('[ ]');

    await todoUpdateTool.run({ id: '1', status: 'in_progress' }, ctx);
    const listResult2 = await todoListTool.run({}, ctx);
    expect(listResult2).toContain('[~]');

    await todoUpdateTool.run({ id: '1', status: 'done' }, ctx);
    const listResult3 = await todoListTool.run({}, ctx);
    expect(listResult3).toContain('[x]');

    resetTodoStore();
  });
});

describe('web fetch tool', () => {
  it('requires url parameter', async () => {
    await expect(webFetchTool.run({}, ctx)).rejects.toThrow(/url/i);
  });
});
