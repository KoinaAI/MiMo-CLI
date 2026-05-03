import { describe, expect, it } from 'vitest';
import { parseSlashCommand } from '../src/ui/commands.js';

describe('parseSlashCommand', () => {
  it('parses known slash commands', () => {
    expect(parseSlashCommand('/load abc')).toEqual({ name: 'load', args: ['abc'] });
    expect(parseSlashCommand('/new sprint 1')).toEqual({ name: 'new', args: ['sprint', '1'] });
    expect(parseSlashCommand('/settings')).toEqual({ name: 'settings', args: [] });
    expect(parseSlashCommand('/model mimo-v2.5')).toEqual({ name: 'model', args: ['mimo-v2.5'] });
    expect(parseSlashCommand('/worktree list')).toEqual({ name: 'worktree', args: ['list'] });
  });

  it('ignores normal prompts and unknown commands', () => {
    expect(parseSlashCommand('fix tests')).toBeUndefined();
    expect(parseSlashCommand('/unknown')).toBeUndefined();
  });
});
