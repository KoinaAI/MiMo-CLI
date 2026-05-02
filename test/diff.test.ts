import { describe, expect, it } from 'vitest';
import { isLikelyDiff } from '../src/ui/diff.js';

describe('isLikelyDiff', () => {
  it('detects unified diffs with --- and +++ headers', () => {
    expect(isLikelyDiff('--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,1 @@\n-old\n+new')).toBe(true);
  });

  it('detects Index:-style diffs with hunks', () => {
    expect(isLikelyDiff('Index: file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@')).toBe(true);
  });

  it('detects git-style diff headers with hunks', () => {
    expect(isLikelyDiff('diff --git a/file.ts b/file.ts\n@@ -1 +1 @@\n-x\n+y')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isLikelyDiff('Hello world\nThis is plain text.')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isLikelyDiff('')).toBe(false);
  });
});
