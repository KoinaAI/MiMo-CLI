import { describe, expect, it } from 'vitest';
import { ThinkingBuffer } from '../src/ui/thinking-buffer.js';

describe('ThinkingBuffer', () => {
  it('coalesces multiple deltas into a single string', () => {
    const buf = new ThinkingBuffer();
    buf.append('Hmm, ');
    buf.append('let me think about ');
    buf.append('this carefully.');
    expect(buf.peek()).toBe('Hmm, let me think about this carefully.');
  });

  it('flushes to a single trimmed string and resets', () => {
    const buf = new ThinkingBuffer();
    buf.append('  step one\n');
    buf.append('step two  ');
    expect(buf.flush()).toBe('step one\nstep two');
    expect(buf.isEmpty()).toBe(true);
    expect(buf.flush()).toBeUndefined();
  });

  it('returns undefined for an empty or whitespace-only flush', () => {
    const buf = new ThinkingBuffer();
    expect(buf.flush()).toBeUndefined();
    buf.append('  \n  ');
    expect(buf.flush()).toBeUndefined();
  });

  it('ignores empty delta strings', () => {
    const buf = new ThinkingBuffer();
    buf.append('');
    buf.append('content');
    buf.append('');
    expect(buf.peek()).toBe('content');
  });
});
