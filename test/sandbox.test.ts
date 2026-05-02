import { describe, expect, it } from 'vitest';
import { defaultSandboxForMode, describeSandbox, isToolAllowed } from '../src/policy/sandbox.js';
import type { ToolDefinition } from '../src/types.js';

const readTool: ToolDefinition = {
  name: 'read_file',
  description: 'read a file',
  inputSchema: { type: 'object', properties: {} },
  readOnly: true,
  async run() { return ''; },
};

const writeTool: ToolDefinition = {
  name: 'write_file',
  description: 'write a file',
  inputSchema: { type: 'object', properties: {} },
  async run() { return ''; },
};

describe('isToolAllowed', () => {
  it('blocks mutating tools in read-only mode', () => {
    const decision = isToolAllowed('read-only', writeTool, { path: 'foo.txt' }, '/work');
    expect(decision.allowed).toBe(false);
  });

  it('allows readOnly tools in read-only mode', () => {
    const decision = isToolAllowed('read-only', readTool, { path: 'foo.txt' }, '/work');
    expect(decision.allowed).toBe(true);
  });

  it('allows mutating tools inside the workspace under workspace-write', () => {
    const decision = isToolAllowed('workspace-write', writeTool, { path: 'src/index.ts' }, '/work');
    expect(decision.allowed).toBe(true);
  });

  it('blocks paths that escape the workspace under workspace-write', () => {
    const decision = isToolAllowed('workspace-write', writeTool, { path: '/etc/passwd' }, '/work');
    expect(decision.allowed).toBe(false);
  });

  it('blocks ../-style escapes under workspace-write', () => {
    const decision = isToolAllowed('workspace-write', writeTool, { path: '../outside.txt' }, '/work');
    expect(decision.allowed).toBe(false);
  });

  it('allows everything under danger-full-access', () => {
    const decision = isToolAllowed('danger-full-access', writeTool, { path: '/etc/passwd' }, '/work');
    expect(decision.allowed).toBe(true);
  });
});

describe('defaultSandboxForMode', () => {
  it('maps modes to expected sandboxes', () => {
    expect(defaultSandboxForMode('plan')).toBe('read-only');
    expect(defaultSandboxForMode('agent')).toBe('workspace-write');
    expect(defaultSandboxForMode('yolo')).toBe('danger-full-access');
  });
});

describe('describeSandbox', () => {
  it('returns a human-readable description', () => {
    expect(describeSandbox('read-only')).toContain('read-only');
    expect(describeSandbox('workspace-write')).toContain('workspace');
    expect(describeSandbox('danger-full-access')).toContain('danger');
  });
});
