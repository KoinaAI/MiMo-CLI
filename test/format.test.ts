import { describe, expect, it } from 'vitest';
import { summarizeToolInput, summarizeToolOutput, eventLabel } from '../src/ui/format.js';

describe('format utilities', () => {
  it('summarizeToolInput truncates long JSON', () => {
    const input = { content: 'a'.repeat(300) };
    const result = summarizeToolInput(input, 180);
    expect(result).toBeDefined();
    expect(result).toContain('...');
  });

  it('summarizeToolOutput truncates long output', () => {
    const result = summarizeToolOutput('x'.repeat(600), 500);
    expect(result).toContain('truncated');
  });

  it('eventLabel returns labels for all event types', () => {
    expect(eventLabel({ type: 'thinking', iteration: 1, maxIterations: 5 })).toContain('1');
    expect(eventLabel({ type: 'assistant_message', content: 'hi' })).toBe('MiMo');
    expect(eventLabel({ type: 'assistant_thinking', content: 'hmm' })).toBe('Thinking');
    expect(eventLabel({ type: 'streaming_delta', content: 'x' })).toBe('Streaming');
    expect(eventLabel({ type: 'tool_call', name: 'read_file', input: {} })).toContain('read_file');
    expect(eventLabel({ type: 'tool_result', name: 'read_file', content: 'ok' })).toContain('read_file');
    expect(eventLabel({ type: 'error', message: 'fail' })).toBe('Error');
    expect(eventLabel({ type: 'done', result: { finalMessage: '', iterations: 1, usage: {} } })).toBe('Done');
  });
});
