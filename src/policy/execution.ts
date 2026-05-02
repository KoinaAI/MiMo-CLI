import type { ExecutionPolicy, ExecutionPolicyLevel, ToolDefinition } from '../types.js';

const DEFAULT_POLICY: ExecutionPolicy = {
  level: 'normal',
};

export function createPolicy(level: ExecutionPolicyLevel = 'normal'): ExecutionPolicy {
  if (level === 'strict') {
    return {
      level: 'strict',
      requireApproval: ['run_shell', 'write_file', 'edit_file', 'apply_patch', 'multi_edit', 'git_commit'],
      blockedTools: [],
    };
  }
  if (level === 'permissive') {
    return {
      level: 'permissive',
      requireApproval: [],
    };
  }
  return DEFAULT_POLICY;
}

export function shouldRequireApproval(policy: ExecutionPolicy, toolName: string, tool: ToolDefinition): boolean {
  if (policy.level === 'permissive') return false;
  if (policy.blockedTools?.includes(toolName)) return true;
  if (policy.requireApproval?.includes(toolName)) return true;
  if (policy.level === 'strict' && !tool.readOnly) return true;
  return false;
}

export function isToolBlocked(policy: ExecutionPolicy, toolName: string): boolean {
  if (policy.blockedTools?.includes(toolName)) return true;
  if (policy.allowedTools && !policy.allowedTools.includes(toolName)) return true;
  return false;
}

export function formatPolicy(policy: ExecutionPolicy): string {
  const lines: string[] = [`Execution Policy: ${policy.level}`];
  if (policy.requireApproval && policy.requireApproval.length > 0) {
    lines.push(`Require approval: ${policy.requireApproval.join(', ')}`);
  }
  if (policy.blockedTools && policy.blockedTools.length > 0) {
    lines.push(`Blocked tools: ${policy.blockedTools.join(', ')}`);
  }
  if (policy.allowedTools && policy.allowedTools.length > 0) {
    lines.push(`Allowed tools only: ${policy.allowedTools.join(', ')}`);
  }
  return lines.join('\n');
}
