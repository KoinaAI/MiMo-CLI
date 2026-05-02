import { spawn } from 'node:child_process';
import type { HookConfig, HookEvent, HookPayload } from './types.js';

export interface HookRunResult {
  hook: string;
  event: HookEvent;
  code: number | null;
  output: string;
}

export async function runHooks(hooks: HookConfig[] | undefined, event: HookEvent, payload: HookPayload): Promise<HookRunResult[]> {
  const enabledHooks = (hooks ?? []).filter((hook) => hook.enabled !== false && hook.event === event);
  const results: HookRunResult[] = [];
  for (const hook of enabledHooks) {
    results.push(await runHook(hook, payload));
  }
  return results;
}

function runHook(hook: HookConfig, payload: HookPayload): Promise<HookRunResult> {
  return new Promise((resolve) => {
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
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      resolve({ hook: hook.name, event: hook.event, code: 1, output: error.message });
    });
    child.on('close', (code) => {
      resolve({ hook: hook.name, event: hook.event, code, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}
