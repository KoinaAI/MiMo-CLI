import { describe, expect, it } from 'vitest';
import { parseSlashCommand, slashCommandSuggestions, completeSlashCommand } from '../src/ui/commands.js';

describe('new slash commands', () => {
  it('parses /mode command', () => {
    expect(parseSlashCommand('/mode plan')).toEqual({ name: 'mode', args: ['plan'] });
    expect(parseSlashCommand('/mode yolo')).toEqual({ name: 'mode', args: ['yolo'] });
    expect(parseSlashCommand('/mode')).toEqual({ name: 'mode', args: [] });
  });

  it('parses /compact command', () => {
    expect(parseSlashCommand('/compact')).toEqual({ name: 'compact', args: [] });
  });

  it('parses /diff command', () => {
    expect(parseSlashCommand('/diff')).toEqual({ name: 'diff', args: [] });
  });

  it('parses /doctor command', () => {
    expect(parseSlashCommand('/doctor')).toEqual({ name: 'doctor', args: [] });
  });

  it('parses /memory with note text', () => {
    expect(parseSlashCommand('/memory remember this')).toEqual({ name: 'memory', args: ['remember', 'this'] });
  });

  it('parses /undo command', () => {
    expect(parseSlashCommand('/undo')).toEqual({ name: 'undo', args: [] });
  });

  it('parses /context command', () => {
    expect(parseSlashCommand('/context')).toEqual({ name: 'context', args: [] });
  });

  it('parses /cost command', () => {
    expect(parseSlashCommand('/cost')).toEqual({ name: 'cost', args: [] });
  });

  it('parses /todo command', () => {
    expect(parseSlashCommand('/todo')).toEqual({ name: 'todo', args: [] });
  });

  it('parses /bug with description', () => {
    expect(parseSlashCommand('/bug crash on save')).toEqual({ name: 'bug', args: ['crash', 'on', 'save'] });
  });

  it('parses /init command', () => {
    expect(parseSlashCommand('/init')).toEqual({ name: 'init', args: [] });
  });

  it('parses workflow observability commands', () => {
    expect(parseSlashCommand('/workflow')).toEqual({ name: 'workflow', args: [] });
    expect(parseSlashCommand('/timeline')).toEqual({ name: 'timeline', args: [] });
  });

  it('suggests new commands', () => {
    const suggestions = slashCommandSuggestions('/mo');
    expect(suggestions.some((s) => s.name === 'mode')).toBe(true);
    expect(suggestions.some((s) => s.name === 'models')).toBe(false);
  });

  it('completes /comp to /compact', () => {
    expect(completeSlashCommand('/compact')).toBe('/compact ');
  });

  it('still recognizes old commands', () => {
    expect(parseSlashCommand('/help')).toEqual({ name: 'help', args: [] });
    expect(parseSlashCommand('/clear')).toEqual({ name: 'clear', args: [] });
    expect(parseSlashCommand('/exit')).toEqual({ name: 'exit', args: [] });
  });
});
