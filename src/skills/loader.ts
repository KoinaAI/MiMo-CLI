import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SkillConfig } from '../types.js';
import { discoverSkills, pickSkillsForPrompt, type DiscoveredSkill } from './discover.js';

export interface LoadedSkill {
  name: string;
  description?: string;
  content: string;
  source: 'config' | 'file';
}

/**
 * Load skills declared in the runtime config (config.skills).
 *
 * Each entry may either inline its content via `description` or point to an
 * external file via `path`.
 */
export async function loadSkills(skills: SkillConfig[] | undefined, cwd: string): Promise<LoadedSkill[]> {
  const enabled = (skills ?? []).filter((skill) => skill.enabled !== false);
  const loaded: LoadedSkill[] = [];
  for (const skill of enabled) {
    const content = skill.path ? await readSkillFile(skill.path, cwd) : (skill.description ?? '');
    loaded.push({
      name: skill.name,
      ...(skill.description ? { description: skill.description } : {}),
      content,
      source: 'config',
    });
  }
  return loaded;
}

/**
 * Build the system-prompt skill context for an agent run.
 *
 * Combines explicit config skills with discovered Markdown skills from
 * `.mimo/skills/` and `~/.mimo-code/skills/`. Discovered skills are filtered
 * by `prompt` to only include those flagged `always` or whose triggers
 * match the prompt — that way a long skill library does not balloon every
 * request.
 */
export async function buildSkillContext(
  skills: SkillConfig[] | undefined,
  cwd: string,
  prompt?: string,
): Promise<string> {
  const config = await loadSkills(skills, cwd);
  const discovered = await discoverSkills(cwd).catch(() => [] as DiscoveredSkill[]);
  const matched = prompt ? pickSkillsForPrompt(discovered, prompt) : discovered.filter((skill) => skill.triggers.includes('__always__'));
  const fileBased: LoadedSkill[] = matched.map((skill) => ({
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    content: skill.body,
    source: 'file',
  }));
  const all = [...config, ...fileBased];
  if (all.length === 0) return '';
  return all
    .map((skill) =>
      [
        `# Skill: ${skill.name}${skill.source === 'file' ? ' (file)' : ''}`,
        skill.description ? `Description: ${skill.description}` : '',
        skill.content,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

async function readSkillFile(skillPath: string, cwd: string): Promise<string> {
  const resolved = path.isAbsolute(skillPath) ? skillPath : path.resolve(cwd, skillPath);
  return readFile(resolved, 'utf8');
}
