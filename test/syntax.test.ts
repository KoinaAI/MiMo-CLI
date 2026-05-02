import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { highlightCode } from '../src/ui/syntax.js';

describe('highlightCode', () => {
  beforeAll(() => {
    chalk.level = 1;
  });

  it('returns the original text content when language is unknown', () => {
    const code = 'plain text\nno highlights here';
    const result = highlightCode(code, 'unknown-lang');
    expect(result).toContain('plain text');
    expect(result).toContain('no highlights here');
  });

  const ESC = String.fromCharCode(27);

  it('inserts ANSI escapes for typescript keywords', () => {
    const code = 'const x = 42;';
    const result = highlightCode(code, 'typescript');
    expect(result).toContain(ESC);
  });

  it('handles language aliases (ts -> typescript, js -> javascript, sh -> shell)', () => {
    expect(highlightCode('const x = 1;', 'ts')).toContain(ESC);
    expect(highlightCode('const x = 1;', 'js')).toContain(ESC);
    expect(highlightCode('if true; then echo hi; fi', 'sh')).toContain(ESC);
  });

  it('does not crash on empty input', () => {
    expect(() => highlightCode('', 'typescript')).not.toThrow();
  });

  it('preserves the original keyword text alongside formatting', () => {
    const result = highlightCode('return value', 'typescript');
    expect(result).toContain('return');
    expect(result).toContain('value');
  });
});
