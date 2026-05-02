import { describe, expect, it } from 'vitest';
import { buildProjectContextPrompt } from '../src/context/project.js';
import type { ProjectContext } from '../src/context/project.js';

describe('project context', () => {
  it('returns empty string for no contexts', () => {
    expect(buildProjectContextPrompt([])).toBe('');
  });

  it('builds prompt from single context', () => {
    const ctx: ProjectContext[] = [
      { path: '/project/AGENTS.md', content: '# Rules\nFollow these rules.' },
    ];
    const prompt = buildProjectContextPrompt(ctx);
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('Follow these rules');
  });

  it('combines multiple contexts with separators', () => {
    const ctx: ProjectContext[] = [
      { path: '/project/AGENTS.md', content: 'Agent rules.' },
      { path: '/project/.claude/instructions.md', content: 'Claude rules.' },
    ];
    const prompt = buildProjectContextPrompt(ctx);
    expect(prompt).toContain('Agent rules');
    expect(prompt).toContain('Claude rules');
    expect(prompt).toContain('---');
  });
});
