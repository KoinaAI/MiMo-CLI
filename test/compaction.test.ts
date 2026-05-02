import { describe, expect, it } from 'vitest';
import { compactMessages, estimateTokenCount, formatContextStats, estimateMessagesTokens } from '../src/context/compaction.js';
import type { ChatMessage } from '../src/types.js';

describe('context compaction', () => {
  it('estimates token count from text', () => {
    const count = estimateTokenCount('hello world');
    expect(count).toBeGreaterThan(0);
  });

  it('estimates messages tokens', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it('does not compact short conversations', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    const compacted = compactMessages(messages);
    expect(compacted.length).toBe(messages.length);
  });

  it('compacts long conversations keeping recent messages', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Question 1' },
      { role: 'assistant', content: 'Answer 1' },
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Answer 2' },
      { role: 'user', content: 'Question 3' },
      { role: 'assistant', content: 'Answer 3' },
      { role: 'user', content: 'Question 4' },
      { role: 'assistant', content: 'Answer 4' },
    ];
    const compacted = compactMessages(messages, 4);
    expect(compacted.length).toBeLessThan(messages.length);
    expect(compacted[compacted.length - 1]!.content).toBe('Answer 4');
    expect(compacted.some((m) => m.content.includes('[Compacted'))).toBe(true);
  });

  it('formats context stats with progress bar', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
    ];
    const stats = formatContextStats(messages);
    expect(stats).toContain('[');
    expect(stats).toContain(']');
    expect(stats).toContain('tokens');
  });
});
