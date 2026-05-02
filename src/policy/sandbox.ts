import path from 'node:path';
import type { SandboxLevel, ToolDefinition } from '../types.js';

/**
 * Decide whether a tool should be permitted under the supplied sandbox
 * level.
 *
 * - `read-only`: only tools marked `readOnly: true` are allowed. Mirrors
 *   Codex's read-only sandbox.
 * - `workspace-write`: read-only tools are always allowed; mutating tools
 *   are allowed *if* their input does not escape the workspace cwd. This
 *   is enforced by inspecting common path-shaped fields.
 * - `danger-full-access`: no restrictions. Use with care.
 */
export function isToolAllowed(level: SandboxLevel, tool: ToolDefinition, input: Record<string, unknown>, cwd: string): { allowed: true } | { allowed: false; reason: string } {
  if (level === 'danger-full-access') return { allowed: true };
  if (tool.readOnly === true) return { allowed: true };
  if (level === 'read-only') {
    return { allowed: false, reason: `Sandbox=read-only blocks mutating tool '${tool.name}'.` };
  }

  // workspace-write: probe input for explicit absolute paths leaving cwd.
  const violation = findOutOfWorkspacePath(input, cwd);
  if (violation) {
    return { allowed: false, reason: `Sandbox=workspace-write blocks path outside workspace: ${violation}` };
  }
  return { allowed: true };
}

/**
 * Recursively walk `input` looking for absolute or `..`-anchored paths that
 * would escape the workspace. Conservative: anything ambiguous is allowed,
 * because over-blocking is worse than under-blocking for a coding tool.
 */
function findOutOfWorkspacePath(value: unknown, cwd: string): string | undefined {
  if (typeof value === 'string') {
    if (looksLikePath(value)) {
      const resolved = path.isAbsolute(value) ? path.normalize(value) : path.normalize(path.resolve(cwd, value));
      const relative = path.relative(cwd, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return resolved;
      }
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOutOfWorkspacePath(item, cwd);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      const found = findOutOfWorkspacePath(child, cwd);
      if (found) return found;
    }
  }
  return undefined;
}

function looksLikePath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.startsWith('../') || value === '..' || value.includes('/../')) return true;
  return false;
}

export function describeSandbox(level: SandboxLevel): string {
  switch (level) {
    case 'read-only':
      return 'read-only — only inspection tools may run';
    case 'workspace-write':
      return 'workspace-write — writes confined to current workspace';
    case 'danger-full-access':
      return 'danger-full-access — no restrictions, autonomy mode';
  }
}

/**
 * Map an interaction mode to a default sandbox level. Mirrors the behaviour
 * Codex / Claude Code apply: plan ⇒ read-only, agent ⇒ workspace-write,
 * yolo ⇒ danger-full-access.
 */
export function defaultSandboxForMode(mode: 'plan' | 'agent' | 'yolo'): SandboxLevel {
  if (mode === 'plan') return 'read-only';
  if (mode === 'yolo') return 'danger-full-access';
  return 'workspace-write';
}
