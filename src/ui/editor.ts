import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Compose a prompt in the user's `$EDITOR` (or `$VISUAL`). Mirrors the
 * `bash`-style "edit current line in editor" pattern that Codex / Claude
 * Code expose for long-form composition.
 *
 * The caller is responsible for pausing Ink's raw mode before invoking
 * this function (otherwise stdin will be eaten by Ink instead of the
 * editor child process).
 */
export async function composeInEditor(initial: string): Promise<string> {
  const editor = pickEditor();
  const dir = await mkdtemp(path.join(tmpdir(), 'mimo-edit-'));
  const file = path.join(dir, 'prompt.md');
  await writeFile(file, initial, 'utf8');
  try {
    await spawnEditor(editor, file);
    const next = await readFile(file, 'utf8');
    return stripTrailingNewline(next);
  } finally {
    await unlink(file).catch(() => undefined);
    await rmdir(dir).catch(() => undefined);
  }
}

function pickEditor(): { command: string; args: string[] } {
  const raw = (process.env.VISUAL ?? process.env.EDITOR ?? '').trim();
  if (raw.length === 0) {
    return { command: 'vi', args: [] };
  }
  // Allow `EDITOR="code --wait"` style overrides.
  const parts = raw.split(/\s+/u).filter(Boolean);
  const head = parts[0];
  if (!head) return { command: 'vi', args: [] };
  return { command: head, args: parts.slice(1) };
}

function spawnEditor(editor: { command: string; args: string[] }, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editor.command, [...editor.args, file], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === null || code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });
  });
}

function stripTrailingNewline(value: string): string {
  if (value.endsWith('\r\n')) return value.slice(0, -2);
  if (value.endsWith('\n')) return value.slice(0, -1);
  return value;
}
