import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SkillConfig } from '../types.js';

export interface LoadedSkill {
  name: string;
  description?: string;
  content: string;
}

export async function loadSkills(skills: SkillConfig[] | undefined, cwd: string): Promise<LoadedSkill[]> {
  const enabled = (skills ?? []).filter((skill) => skill.enabled !== false);
  const loaded: LoadedSkill[] = [];
  for (const skill of enabled) {
    const content = skill.path ? await readSkillFile(skill.path, cwd) : (skill.description ?? '');
    loaded.push({ name: skill.name, ...(skill.description ? { description: skill.description } : {}), content });
  }
  return loaded;
}

export async function buildSkillContext(skills: SkillConfig[] | undefined, cwd: string): Promise<string> {
  const loaded = await loadSkills(skills, cwd);
  if (loaded.length === 0) return '';
  return loaded
    .map((skill) => [`# Skill: ${skill.name}`, skill.description ? `Description: ${skill.description}` : '', skill.content].filter(Boolean).join('\n'))
    .join('\n\n');
}

async function readSkillFile(skillPath: string, cwd: string): Promise<string> {
  const resolved = path.isAbsolute(skillPath) ? skillPath : path.resolve(cwd, skillPath);
  return readFile(resolved, 'utf8');
}
