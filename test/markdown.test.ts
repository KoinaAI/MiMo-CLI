import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/ui/markdown.js';

describe('markdown renderer', () => {
  it('renders plain text', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });

  it('renders code blocks', () => {
    const md = '```typescript\nconst x = 1;\n```';
    const result = renderMarkdown(md);
    expect(result).toContain('typescript');
    expect(result).toContain('const x = 1;');
  });

  it('renders bullet lists', () => {
    const md = '- item one\n- item two\n- item three';
    const result = renderMarkdown(md);
    expect(result).toContain('item one');
    expect(result).toContain('item two');
  });

  it('renders numbered lists', () => {
    const md = '1. first\n2. second';
    const result = renderMarkdown(md);
    expect(result).toContain('first');
    expect(result).toContain('second');
  });

  it('renders headers', () => {
    const md = '# Title\n## Subtitle\n### Section';
    const result = renderMarkdown(md);
    expect(result).toContain('Title');
    expect(result).toContain('Subtitle');
    expect(result).toContain('Section');
  });

  it('renders blockquotes', () => {
    const md = '> This is a quote';
    const result = renderMarkdown(md);
    expect(result).toContain('This is a quote');
  });

  it('renders horizontal rules', () => {
    const md = 'before\n---\nafter';
    const result = renderMarkdown(md);
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('handles empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('handles unclosed code blocks', () => {
    const md = '```js\nconst x = 1;';
    const result = renderMarkdown(md);
    expect(result).toContain('const x = 1;');
  });
});
