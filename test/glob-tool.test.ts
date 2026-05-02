import { describe, expect, it } from 'vitest';
import { globTool } from '../src/tools/glob.js';
import type { ToolContext } from '../src/types.js';
import path from 'node:path';

const context: ToolContext = {
  cwd: path.resolve(import.meta.dirname, '..'),
  dryRun: false,
  autoApprove: true,
};

describe('glob tool', () => {
  it('finds TypeScript files', async () => {
    const result = await globTool.run({ pattern: '*.ts', path: 'src/utils' }, context);
    expect(result).toContain('.ts');
  });

  it('finds files in specific directory', async () => {
    const result = await globTool.run({ pattern: '*.ts', path: 'src/tools' }, context);
    expect(result).toContain('Found');
    expect(result).toContain('.ts');
  });

  it('supports ** glob across directories', async () => {
    const result = await globTool.run({ pattern: '**/*.test.ts', path: 'test' }, context);
    expect(result).toContain('.test.ts');
  });

  it('returns no-match message for impossible pattern', async () => {
    const result = await globTool.run({ pattern: '*.xyz_nonexistent' }, context);
    expect(result).toContain('No files matching');
  });

  it('is read-only', () => {
    expect(globTool.readOnly).toBe(true);
  });
});
