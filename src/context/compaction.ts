import type { ChatMessage, TokenUsage } from '../types.js';

const ROUGH_CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / ROUGH_CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokenCount(message.content || '') + 4, 0);
}

export function compactMessages(messages: ChatMessage[], keepLast: number = 4): ChatMessage[] {
  if (messages.length <= keepLast + 1) return messages;

  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  if (nonSystem.length <= keepLast) return messages;

  const toCompact = nonSystem.slice(0, nonSystem.length - keepLast);
  const toKeep = nonSystem.slice(nonSystem.length - keepLast);

  const summary = summarizeMessages(toCompact);
  return [
    ...systemMessages,
    { role: 'system' as const, content: `[Compacted conversation summary]\n${summary}` },
    ...toKeep,
  ];
}

function summarizeMessages(messages: ChatMessage[]): string {
  const parts: string[] = [];
  const toolCalls = new Set<string>();
  const topics = new Set<string>();

  for (const message of messages) {
    if (message.role === 'user') {
      const snippet = message.content.slice(0, 100);
      topics.add(snippet);
    }
    if (message.role === 'assistant' && message.toolCalls) {
      for (const tc of message.toolCalls) {
        toolCalls.add(tc.name);
      }
    }
    if (message.role === 'tool') {
      const name = message.name ?? 'unknown';
      toolCalls.add(name);
    }
  }

  if (topics.size > 0) {
    parts.push(`User topics: ${[...topics].join('; ')}`);
  }
  if (toolCalls.size > 0) {
    parts.push(`Tools used: ${[...toolCalls].join(', ')}`);
  }
  parts.push(`Messages compacted: ${messages.length}`);

  return parts.join('\n');
}

export function formatContextStats(messages: ChatMessage[], maxContext: number = 128_000): string {
  const tokens = estimateMessagesTokens(messages);
  const percent = Math.round((tokens / maxContext) * 100);
  const bar = progressBar(percent, 20);
  return `${bar} ${tokens.toLocaleString()}/${maxContext.toLocaleString()} tokens (${percent}%)`;
}

function progressBar(percent: number, width: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

export function formatTokenUsageDetails(usage: TokenUsage): string {
  const lines: string[] = [];
  if (usage.inputTokens !== undefined) lines.push(`Input:        ${usage.inputTokens.toLocaleString()}`);
  if (usage.outputTokens !== undefined) lines.push(`Output:       ${usage.outputTokens.toLocaleString()}`);
  if (usage.cacheReadInputTokens !== undefined) lines.push(`Cache Read:   ${usage.cacheReadInputTokens.toLocaleString()}`);
  if (usage.cacheCreationInputTokens !== undefined) lines.push(`Cache Write:  ${usage.cacheCreationInputTokens.toLocaleString()}`);
  return lines.join('\n');
}
