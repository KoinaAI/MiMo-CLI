import type { TokenUsage } from '../types.js';

export function mergeUsage(left: TokenUsage, right?: TokenUsage): TokenUsage {
  if (!right) return left;
  const usage: TokenUsage = {};
  assignSum(usage, 'inputTokens', left.inputTokens, right.inputTokens);
  assignSum(usage, 'outputTokens', left.outputTokens, right.outputTokens);
  assignSum(usage, 'cacheReadInputTokens', left.cacheReadInputTokens, right.cacheReadInputTokens);
  assignSum(usage, 'cacheCreationInputTokens', left.cacheCreationInputTokens, right.cacheCreationInputTokens);
  return usage;
}

export function formatUsage(usage: TokenUsage): string {
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`input ${usage.inputTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`output ${usage.outputTokens}`);
  if (usage.cacheReadInputTokens !== undefined) parts.push(`cache hit ${usage.cacheReadInputTokens}`);
  if (usage.cacheCreationInputTokens !== undefined) parts.push(`cache write ${usage.cacheCreationInputTokens}`);
  return parts.length > 0 ? parts.join(', ') : 'usage unavailable';
}

function assignSum(keyedUsage: TokenUsage, key: keyof TokenUsage, left?: number, right?: number): void {
  if (left !== undefined || right !== undefined) {
    keyedUsage[key] = (left ?? 0) + (right ?? 0);
  }
}
