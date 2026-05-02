import { describe, expect, it } from 'vitest';
import { readManyFilesTool } from '../src/tools/read-many.js';
import type { ToolContext } from '../src/types.js';
import path from 'node:path';

const context: ToolContext = {
  cwd: path.resolve(import.meta.dirname, '..'),
  dryRun: false,
  autoApprove: true,
};

describe('read_many_files tool', () => {
  it('reads multiple files', async () => {
    const result = await readManyFilesTool.run({ paths: ['package.json', 'tsconfig.json'] }, context);
    expect(result).toContain('package.json');
    expect(result).toContain('tsconfig.json');
    expect(result).toContain('mimo-code-cli');
  });

  it('handles non-existent files gracefully', async () => {
    const result = await readManyFilesTool.run({ paths: ['nonexistent.txt'] }, context);
    expect(result).toContain('[error:');
  });

  it('returns error for empty paths', async () => {
    const result = await readManyFilesTool.run({ paths: [] }, context);
    expect(result).toContain('non-empty array');
  });

  it('is read-only', () => {
    expect(readManyFilesTool.readOnly).toBe(true);
  });
});
