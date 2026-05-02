import { spawn } from 'node:child_process';
import type { HookConfig, HookEvent, HookPayload } from './types.js';

export interface HookRunResult {
  hook: string;
  event: HookEvent;
  /** Process exit code. `null` means the process was killed before exit. */
  code: number | null;
  /** Combined stdout + stderr. */
  output: string;
  /**
   * `true` if any hook for this event signalled a cancel via exit code 2.
   * Hosts that respect cancel semantics (e.g. `pre_tool_use`) should abort
   * the pending action when this flag is set.
   *
   * The convention is borrowed from Claude Code: `exit code 2` means
   * "block this action", any other non-zero is a soft warning.
   */
  cancelled: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run all enabled hooks for a given event in registration order.
 *
 * Hooks may signal cancel via exit code 2 (Claude Code convention). The
 * returned list reports `cancelled: true` for those hooks; aggregate
 * cancellation can be checked with {@link wasCancelled}.
 */
export async function runHooks(
  hooks: HookConfig[] | undefined,
  event: HookEvent,
  payload: HookPayload,
): Promise<HookRunResult[]> {
  const enabledHooks = (hooks ?? []).filter((hook) => {
    if (hook.enabled === false) return false;
    if (hook.event !== event) return false;
    if (hook.matcher && payload.toolName && !matchHookTool(hook.matcher, payload.toolName)) return false;
    return true;
  });
  const results: HookRunResult[] = [];
  for (const hook of enabledHooks) {
    results.push(await runHook(hook, payload));
  }
  return results;
}

export function wasCancelled(results: HookRunResult[]): boolean {
  return results.some((result) => result.cancelled);
}

function matchHookTool(matcher: string, toolName: string): boolean {
  if (matcher === '*') return true;
  if (matcher === toolName) return true;
  if (matcher.endsWith('*') && toolName.startsWith(matcher.slice(0, -1))) return true;
  return false;
}

function runHook(hook: HookConfig, payload: HookPayload): Promise<HookRunResult> {
  return new Promise((resolve) => {
    const timeoutMs = hook.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const child = spawn(hook.command, hook.args ?? [], {
      cwd: payload.cwd,
      shell: false,
      env: {
        ...process.env,
        ...hook.env,
        MIMO_HOOK_EVENT: hook.event,
        MIMO_HOOK_PAYLOAD: JSON.stringify(payload),
      },
    });

    // Stream the payload on stdin too, mirroring Claude Code's behaviour so
    // the hook can choose whichever transport is most convenient.
    try {
      child.stdin.write(JSON.stringify({ event: hook.event, ...payload }) + '\n');
      child.stdin.end();
    } catch {
      // Hook may not need stdin; ignore EPIPE.
    }

    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(killTimer);
      resolve({ hook: hook.name, event: hook.event, code: 1, output: error.message, cancelled: false });
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      const output = Buffer.concat(chunks).toString('utf8');
      resolve({
        hook: hook.name,
        event: hook.event,
        code,
        output,
        cancelled: code === 2,
      });
    });
  });
}
