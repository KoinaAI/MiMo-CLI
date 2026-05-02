import { describe, expect, it } from 'vitest';
import { decoration, renderAssistantBody } from '../src/ui/transcript.js';

describe('decoration', () => {
  it('returns the right sigil for each message kind', () => {
    expect(decoration('user').sigil).toBeDefined();
    expect(decoration('assistant').sigil).toBeDefined();
    expect(decoration('tool_call').sigil).toBeDefined();
    expect(decoration('tool_result').sigil).toBeDefined();
    expect(decoration('error').sigil).toBeDefined();
  });

  it('returns distinct colors for different kinds', () => {
    const userColor = decoration('user').color;
    const errorColor = decoration('error').color;
    expect(userColor).not.toBe(errorColor);
  });
});

describe('renderAssistantBody', () => {
  it('passes content through markdown rendering', () => {
    const body = renderAssistantBody('# Hello\n\nSome **bold** text.');
    expect(body).toContain('Hello');
    expect(body).toContain('text');
  });
});
