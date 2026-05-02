import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSkills, parseFrontMatter, pickSkillsForPrompt } from '../src/skills/discover.js';

describe('parseFrontMatter', () => {
  it('returns empty front matter when missing', () => {
    const result = parseFrontMatter('Just a plain markdown body');
    expect(result.frontMatter).toEqual({});
    expect(result.body).toBe('Just a plain markdown body');
  });

  it('parses scalar fields', () => {
    const text = `---
name: my-skill
description: a useful skill
always: true
---
Body text here.`;
    const { frontMatter, body } = parseFrontMatter(text);
    expect(frontMatter.name).toBe('my-skill');
    expect(frontMatter.description).toBe('a useful skill');
    expect(frontMatter.always).toBe(true);
    expect(body.trim()).toBe('Body text here.');
  });

  it('parses inline list literals', () => {
    const text = `---
name: triggered
triggers: ["test", "build", "lint"]
---
body`;
    const { frontMatter } = parseFrontMatter(text);
    expect(frontMatter.triggers).toEqual(['test', 'build', 'lint']);
  });

  it('parses multi-line list literals', () => {
    const text = `---
name: multi
triggers:
  - first
  - second
  - third
---
body`;
    const { frontMatter } = parseFrontMatter(text);
    expect(frontMatter.triggers).toEqual(['first', 'second', 'third']);
  });
});

describe('discoverSkills', () => {
  it('reads skill files from .mimo/skills directory', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-discover-'));
    const dir = path.join(cwd, '.mimo', 'skills');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'patch-discipline.md'),
      `---
name: patch-discipline
description: keep patches small
triggers: [patch, edit]
---
Use minimal diffs.`,
      'utf8',
    );
    const skills = await discoverSkills(cwd);
    expect(skills.length).toBe(1);
    expect(skills[0]?.name).toBe('patch-discipline');
    expect(skills[0]?.scope).toBe('project');
    expect(skills[0]?.triggers).toEqual(['patch', 'edit']);
    expect(skills[0]?.body).toContain('Use minimal diffs.');
  });

  it('returns empty array when no skill directories exist', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-discover-empty-'));
    process.env.HOME = cwd;
    const skills = await discoverSkills(cwd);
    expect(skills).toEqual([]);
  });
});

describe('pickSkillsForPrompt', () => {
  const skills = [
    { name: 'always-on', triggers: ['__always__'], scope: 'project' as const, filePath: '', body: '' },
    { name: 'test-only', triggers: ['test', 'vitest'], scope: 'project' as const, filePath: '', body: '' },
    { name: 'build-only', triggers: ['build'], scope: 'project' as const, filePath: '', body: '' },
  ];

  it('always loads __always__ skills', () => {
    const matched = pickSkillsForPrompt(skills, 'plain prompt');
    expect(matched.map((s) => s.name)).toContain('always-on');
  });

  it('matches triggers case-insensitively', () => {
    const matched = pickSkillsForPrompt(skills, 'please run the VITEST suite');
    expect(matched.map((s) => s.name)).toContain('test-only');
  });

  it('skips non-matching triggers', () => {
    const matched = pickSkillsForPrompt(skills, 'render the button');
    expect(matched.map((s) => s.name)).not.toContain('test-only');
    expect(matched.map((s) => s.name)).not.toContain('build-only');
  });
});
