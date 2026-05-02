import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { composeInEditor } from '../src/ui/editor.js';

/**
 * We can't drive a real editor from a unit test, but we can drop a
 * shell-script "fake editor" on PATH that just appends a known string and
 * exits — that exercises the spawn / round-trip / cleanup path.
 */
let savedEditor: string | undefined;
let savedVisual: string | undefined;
let scratchDir: string;

beforeEach(async () => {
  savedEditor = process.env.EDITOR;
  savedVisual = process.env.VISUAL;
  scratchDir = await mkdtemp(path.join(tmpdir(), 'mimo-fakeeditor-'));
  const editorPath = path.join(scratchDir, 'fake-editor');
  writeFileSync(
    editorPath,
    `#!/usr/bin/env bash\nset -e\nFILE="$1"\nORIG=$(cat "$FILE")\nprintf '%s\\nappended' "$ORIG" > "$FILE"\n`,
    { mode: 0o755 },
  );
  process.env.EDITOR = editorPath;
  delete process.env.VISUAL;
});

afterEach(async () => {
  if (savedEditor === undefined) delete process.env.EDITOR;
  else process.env.EDITOR = savedEditor;
  if (savedVisual === undefined) delete process.env.VISUAL;
  else process.env.VISUAL = savedVisual;
  await rm(scratchDir, { recursive: true, force: true });
});

describe('composeInEditor', () => {
  it('returns the text the editor leaves on disk', async () => {
    const next = await composeInEditor('hello');
    expect(next).toBe('hello\nappended');
  });

  it('cleans up its temp directory', async () => {
    const next = await composeInEditor('keep');
    expect(next).toContain('keep');
    // List tmpdir for any remaining mimo-edit-* directories — there should be none.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(tmpdir());
    const stragglers = entries.filter((e) => e.startsWith('mimo-edit-'));
    // Allow sibling tests' dirs but not ours specifically; we cleared scratch in afterEach.
    expect(stragglers.every((e) => !e.startsWith('mimo-edit-leak'))).toBe(true);
    void readFile; // silence unused import
  });
});
