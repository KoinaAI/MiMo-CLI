import { describe, expect, it } from 'vitest';
import { createPolicy, shouldRequireApproval, isToolBlocked, formatPolicy } from '../src/policy/execution.js';
import type { ToolDefinition } from '../src/types.js';

const readOnlyTool: ToolDefinition = {
  name: 'read_file',
  description: 'read',
  inputSchema: { type: 'object' },
  readOnly: true,
  run: async () => 'ok',
};

const writeTool: ToolDefinition = {
  name: 'write_file',
  description: 'write',
  inputSchema: { type: 'object' },
  run: async () => 'ok',
};

describe('execution policy', () => {
  it('creates normal policy', () => {
    const policy = createPolicy('normal');
    expect(policy.level).toBe('normal');
  });

  it('creates strict policy', () => {
    const policy = createPolicy('strict');
    expect(policy.level).toBe('strict');
    expect(policy.requireApproval).toBeDefined();
    expect(policy.requireApproval!.length).toBeGreaterThan(0);
  });

  it('creates permissive policy', () => {
    const policy = createPolicy('permissive');
    expect(policy.level).toBe('permissive');
  });

  it('strict policy requires approval for mutating tools', () => {
    const policy = createPolicy('strict');
    expect(shouldRequireApproval(policy, 'write_file', writeTool)).toBe(true);
  });

  it('strict policy requires approval for non-readOnly tools', () => {
    const policy = createPolicy('strict');
    expect(shouldRequireApproval(policy, 'custom_tool', writeTool)).toBe(true);
  });

  it('permissive policy does not require approval', () => {
    const policy = createPolicy('permissive');
    expect(shouldRequireApproval(policy, 'write_file', writeTool)).toBe(false);
    expect(shouldRequireApproval(policy, 'read_file', readOnlyTool)).toBe(false);
  });

  it('blocks tools in blockedTools list', () => {
    const policy = createPolicy('normal');
    policy.blockedTools = ['dangerous_tool'];
    expect(isToolBlocked(policy, 'dangerous_tool')).toBe(true);
    expect(isToolBlocked(policy, 'safe_tool')).toBe(false);
  });

  it('restricts to allowedTools when set', () => {
    const policy = createPolicy('normal');
    policy.allowedTools = ['read_file', 'list_files'];
    expect(isToolBlocked(policy, 'read_file')).toBe(false);
    expect(isToolBlocked(policy, 'write_file')).toBe(true);
  });

  it('formats policy output', () => {
    const policy = createPolicy('strict');
    const formatted = formatPolicy(policy);
    expect(formatted).toContain('strict');
    expect(formatted).toContain('Require approval');
  });
});
