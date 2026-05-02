import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSkillContext } from '../src/skills/loader.js';

describe('buildSkillContext', () => {
  it('loads enabled skills from files', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-skills-'));
    await writeFile(path.join(cwd, 'skill.md'), 'Use small patches.');
    const context = await buildSkillContext([{ name: 'patch', path: 'skill.md', description: 'Patch discipline' }], cwd);
    expect(context).toContain('# Skill: patch');
    expect(context).toContain('Use small patches.');
  });
});
