import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { appendInputHistory, loadInputHistory } from '../src/ui/history.js';

describe('input history', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(path.join(tmpdir(), 'mimo-history-'));
    process.env.HOME = tmpHome;
  });

  it('returns empty array when no history file exists', async () => {
    const entries = await loadInputHistory();
    expect(entries).toEqual([]);
  });

  it('reads existing history entries oldest-first', async () => {
    const dir = path.join(tmpHome, '.mimo-code');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'history'), 'first\nsecond\nthird\n', 'utf8');
    const entries = await loadInputHistory();
    expect(entries).toEqual(['first', 'second', 'third']);
  });

  it('appends a new entry to history', async () => {
    await appendInputHistory('hello world');
    const filePath = path.join(tmpHome, '.mimo-code', 'history');
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('hello world');
  });

  it('deduplicates consecutive identical entries', async () => {
    await appendInputHistory('same');
    await appendInputHistory('same');
    await appendInputHistory('same');
    const entries = await loadInputHistory();
    const sameEntries = entries.filter((entry) => entry === 'same');
    expect(sameEntries.length).toBe(1);
  });
});
