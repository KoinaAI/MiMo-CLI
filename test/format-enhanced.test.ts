import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimestamp } from '../src/ui/format.js';

describe('format utilities', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(50)).toBe('50ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(30000)).toBe('30.0s');
  });

  it('formats minutes', () => {
    expect(formatDuration(90000)).toBe('1m30s');
    expect(formatDuration(120000)).toBe('2m0s');
  });

  it('formats timestamp', () => {
    const ts = formatTimestamp(new Date('2024-01-01T12:30:45Z'));
    expect(ts).toBe('12:30:45');
  });

  it('formats current timestamp', () => {
    const ts = formatTimestamp();
    expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
