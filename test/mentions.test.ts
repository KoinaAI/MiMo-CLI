import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyMention, expandMentions, findMentionAt, suggestMentions } from '../src/ui/mentions.js';

describe('findMentionAt', () => {
  it('detects an @-mention at the end of the buffer', () => {
    const v = 'please look at @src/foo';
    const ctx = findMentionAt(v, v.length);
    expect(ctx).toEqual({ query: 'src/foo', start: v.indexOf('@'), end: v.length });
  });

  it('returns undefined when the cursor is not in a mention token', () => {
    expect(findMentionAt('plain text', 5)).toBeUndefined();
  });

  it('does not trigger inside a word like user@host', () => {
    expect(findMentionAt('contact me at user@host', 21)).toBeUndefined();
  });

  it('treats @ at column 0 as a mention', () => {
    expect(findMentionAt('@README', 7)).toEqual({ query: 'README', start: 0, end: 7 });
  });

  it('treats @ after whitespace as a mention', () => {
    const v = 'hi @rea';
    expect(findMentionAt(v, v.length)).toEqual({ query: 'rea', start: 3, end: v.length });
  });
});

describe('applyMention', () => {
  it('replaces the @-token with the chosen path and moves the cursor to the end', () => {
    const v = 'see @sr';
    const ctx = findMentionAt(v, v.length)!;
    const { value, cursor } = applyMention(v, ctx, 'src/cli.ts');
    expect(value).toBe('see @src/cli.ts');
    expect(cursor).toBe('see @src/cli.ts'.length);
  });

  it('preserves text after the mention token', () => {
    const v = 'open @rea now';
    const cursor = v.indexOf(' now');
    const ctx = findMentionAt(v, cursor)!;
    const { value } = applyMention(v, ctx, 'README.md');
    expect(value).toBe('open @README.md now');
  });
});

describe('suggestMentions', () => {
  it('returns matching workspace files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mimo-mentions-'));
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'cli.ts'), '');
      await writeFile(path.join(dir, 'README.md'), '');
      const results = await suggestMentions(dir, 'cli');
      expect(results).toContain('src/cli.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules and dotfiles', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mimo-mentions-'));
    try {
      await mkdir(path.join(dir, 'node_modules', 'foo'), { recursive: true });
      await writeFile(path.join(dir, 'node_modules', 'foo', 'index.js'), '');
      await mkdir(path.join(dir, '.git'), { recursive: true });
      await writeFile(path.join(dir, '.git', 'HEAD'), '');
      await writeFile(path.join(dir, 'visible.ts'), '');
      const results = await suggestMentions(dir, '');
      expect(results).toContain('visible.ts');
      expect(results.some((r) => r.startsWith('node_modules/'))).toBe(false);
      expect(results.some((r) => r.startsWith('.git/'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers basename matches starting with the query', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mimo-mentions-'));
    try {
      await mkdir(path.join(dir, 'tests'), { recursive: true });
      await writeFile(path.join(dir, 'tests', 'unrelated-readme.txt'), '');
      await writeFile(path.join(dir, 'README.md'), '');
      const results = await suggestMentions(dir, 'rea');
      expect(results[0]).toBe('README.md');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('expandMentions', () => {
  it('inlines file content for each @-mention', async () => {
    const fakeRead = async (rel: string): Promise<string> => {
      if (rel === 'src/foo.ts') return 'export const foo = 1;';
      throw new Error('not found');
    };
    const result = await expandMentions('check @src/foo.ts please', fakeRead);
    expect(result.attached).toEqual(['src/foo.ts']);
    expect(result.missing).toEqual([]);
    expect(result.prompt).toContain('<file path="src/foo.ts">');
    expect(result.prompt).toContain('export const foo = 1;');
  });

  it('records missing mentions instead of throwing', async () => {
    const result = await expandMentions('see @missing/path', async () => {
      throw new Error('nope');
    });
    expect(result.missing).toEqual(['missing/path']);
    expect(result.attached).toEqual([]);
    expect(result.prompt).toContain('@missing/path');
  });

  it('truncates very long files to a safe ceiling', async () => {
    const huge = 'x'.repeat(8192);
    const result = await expandMentions('@huge.txt', async () => huge);
    expect(result.prompt).toContain('[truncated]');
    expect(result.prompt.length).toBeLessThan(huge.length + 200);
  });

  it('treats file content with $& and $1 as literal text, not regex backrefs', async () => {
    const tricky = 'price = $&\nfirst capture: $1\ndollar: $$';
    const result = await expandMentions('see @tricky.txt', async () => tricky);
    expect(result.attached).toEqual(['tricky.txt']);
    expect(result.prompt).toContain('price = $&');
    expect(result.prompt).toContain('first capture: $1');
    expect(result.prompt).toContain('dollar: $$');
  });
});
