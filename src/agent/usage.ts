import type { CostEstimate, TokenUsage } from '../types.js';

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

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'mimo-v2.5-pro': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'mimo-v2.5': { inputPer1k: 0.001, outputPer1k: 0.005 },
  'mimo-v2-pro': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'mimo-v2-omni': { inputPer1k: 0.002, outputPer1k: 0.010 },
  'mimo-v2-flash': { inputPer1k: 0.0005, outputPer1k: 0.002 },
};

export function estimateCost(model: string, usage: TokenUsage): CostEstimate | undefined {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return undefined;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  };
}

export function formatCost(cost: CostEstimate | undefined): string {
  if (!cost) return '';
  return `$${cost.totalCost.toFixed(4)}`;
}

export function formatContextUsage(inputTokens: number, maxContext: number): string {
  const percent = Math.round((inputTokens / maxContext) * 100);
  const bar = progressBar(percent, 20);
  return `${bar} ${percent}% context`;
}

function progressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function assignSum(keyedUsage: TokenUsage, key: keyof TokenUsage, left?: number, right?: number): void {
  if (left !== undefined || right !== undefined) {
    keyedUsage[key] = (left ?? 0) + (right ?? 0);
  }
}
