import { describe, expect, it } from 'vitest';
import { parseSlashCommand } from '../src/ui/commands.js';

describe('parseSlashCommand', () => {
  it('parses known slash commands', () => {
    expect(parseSlashCommand('/load abc')).toEqual({ name: 'load', args: ['abc'] });
    expect(parseSlashCommand('/new sprint 1')).toEqual({ name: 'new', args: ['sprint', '1'] });
  });

  it('ignores normal prompts and unknown commands', () => {
    expect(parseSlashCommand('fix tests')).toBeUndefined();
    expect(parseSlashCommand('/unknown')).toBeUndefined();
  });
});
