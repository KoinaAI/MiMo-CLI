import { describe, expect, it } from 'vitest';
import { resolveWorkspacePath } from '../src/tools/paths.js';

describe('resolveWorkspacePath', () => {
  it('allows paths inside workspace', () => {
    expect(resolveWorkspacePath('/tmp/work', 'src/index.ts')).toBe('/tmp/work/src/index.ts');
  });

  it('rejects paths outside workspace', () => {
    expect(() => resolveWorkspacePath('/tmp/work', '../secret')).toThrow(/escapes workspace/);
  });
});
