import { describe, expect, it } from 'vitest';
import { mergeUsage, formatUsage, estimateCost, formatCost, formatContextUsage } from '../src/agent/usage.js';

describe('token usage utilities', () => {
  it('merges usage objects', () => {
    const merged = mergeUsage(
      { inputTokens: 10, outputTokens: 5 },
      { inputTokens: 20, outputTokens: 15 },
    );
    expect(merged.inputTokens).toBe(30);
    expect(merged.outputTokens).toBe(20);
  });

  it('handles undefined fields in merge', () => {
    const merged = mergeUsage({}, { inputTokens: 10 });
    expect(merged.inputTokens).toBe(10);
    expect(merged.outputTokens).toBeUndefined();
  });

  it('formats usage string', () => {
    const result = formatUsage({ inputTokens: 100, outputTokens: 50 });
    expect(result).toContain('100');
    expect(result).toContain('50');
  });

  it('formats empty usage', () => {
    const result = formatUsage({});
    expect(typeof result).toBe('string');
  });
});

describe('cost estimation', () => {
  it('estimates cost for known model', () => {
    const cost = estimateCost('mimo-v2.5-pro', { inputTokens: 1000, outputTokens: 1000 });
    expect(cost).toBeDefined();
    expect(cost!.totalCost).toBeGreaterThan(0);
    expect(cost!.currency).toBe('USD');
  });

  it('returns undefined for unknown model', () => {
    const cost = estimateCost('unknown-model', { inputTokens: 1000, outputTokens: 1000 });
    expect(cost).toBeUndefined();
  });

  it('formats cost string', () => {
    const cost = estimateCost('mimo-v2.5-pro', { inputTokens: 1000, outputTokens: 1000 });
    const formatted = formatCost(cost);
    expect(formatted).toContain('$');
  });

  it('formats undefined cost', () => {
    const formatted = formatCost(undefined);
    expect(formatted).toBe('');
  });
});

describe('context usage display', () => {
  it('shows progress bar', () => {
    const result = formatContextUsage(20000, 128000);
    expect(result).toContain('[');
    expect(result).toContain(']');
    expect(result).toContain('%');
  });

  it('clamps percentages above 100 instead of throwing', () => {
    expect(() => formatContextUsage(200_000, 128_000)).not.toThrow();
    const result = formatContextUsage(200_000, 128_000);
    expect(result).toContain('[');
    expect(result).toContain(']');
  });

  it('handles non-finite or negative input without throwing', () => {
    expect(() => formatContextUsage(-1, 128_000)).not.toThrow();
    expect(() => formatContextUsage(Number.NaN, 128_000)).not.toThrow();
    expect(() => formatContextUsage(0, 0)).not.toThrow();
  });
});

