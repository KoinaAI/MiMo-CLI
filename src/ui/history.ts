import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { USER_CONFIG_DIR } from '../constants.js';

const MAX_HISTORY = 500;

function historyFilePath(): string {
  return path.join(homedir(), USER_CONFIG_DIR, 'history');
}

/**
 * Load up to {@link MAX_HISTORY} most-recent entries from the persistent
 * input history file. Returns oldest-first so callers can append new
 * entries to the tail and walk backward with the up-arrow key.
 */
export async function loadInputHistory(): Promise<string[]> {
  try {
    const content = await readFile(historyFilePath(), 'utf8');
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

/**
 * Append an entry to the persistent history. De-dupes consecutive duplicates
 * to avoid filling history with repeated up-arrow re-submissions.
 */
export async function appendInputHistory(entry: string): Promise<void> {
  const trimmed = entry.trim();
  if (!trimmed) return;
  try {
    const existing = await loadInputHistory();
    const last = existing[existing.length - 1];
    if (last === trimmed) return;
    existing.push(trimmed);
    const recent = existing.slice(-MAX_HISTORY);
    await mkdir(path.dirname(historyFilePath()), { recursive: true, mode: 0o700 });
    await writeFile(historyFilePath(), `${recent.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // History persistence is best-effort; never crash the TUI on disk errors.
  }
}
