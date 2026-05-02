import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { USER_CONFIG_DIR } from '../constants.js';

/**
 * A discovered skill: a Markdown document with optional YAML front matter
 * declaring metadata. Discovery walks `.mimo/skills/` (project-scoped) and
 * `~/.mimo-code/skills/` (user-scoped), parsing each `*.md` file's
 * frontmatter for trigger keywords and descriptions.
 *
 * The Markdown body becomes the skill content injected into the model's
 * system prompt when the skill is loaded.
 */
export interface DiscoveredSkill {
  name: string;
  description?: string;
  triggers: string[];
  scope: 'project' | 'user';
  filePath: string;
  body: string;
}

/**
 * Parsed YAML frontmatter as a flexible record. Known fields are typed
 * via {@link KnownFrontMatter}; everything else is stored verbatim.
 */
export type FrontMatterValue = string | string[] | boolean;
export interface FrontMatter extends Record<string, FrontMatterValue | undefined> {
  name?: string;
  description?: string;
  triggers?: string[];
  always?: boolean;
}

const PROJECT_SKILLS_DIR = path.join('.mimo', 'skills');

export async function discoverSkills(cwd: string): Promise<DiscoveredSkill[]> {
  const userDir = path.join(homedir(), USER_CONFIG_DIR, 'skills');
  const projectDir = path.join(cwd, PROJECT_SKILLS_DIR);
  const [user, project] = await Promise.all([
    walkSkillDir(userDir, 'user'),
    walkSkillDir(projectDir, 'project'),
  ]);
  // Project skills override user skills with the same name.
  const merged = new Map<string, DiscoveredSkill>();
  for (const skill of user) merged.set(skill.name, skill);
  for (const skill of project) merged.set(skill.name, skill);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pick skills that should be loaded for a given user prompt.
 *
 * - Skills with `always: true` are always loaded.
 * - Skills with `triggers: [...]` are loaded if the prompt contains any
 *   trigger keyword (case-insensitive substring).
 */
export function pickSkillsForPrompt(skills: DiscoveredSkill[], prompt: string, includeAlways = true): DiscoveredSkill[] {
  const lower = prompt.toLowerCase();
  return skills.filter((skill) => {
    if (skill.triggers.includes('__always__') && includeAlways) return true;
    return skill.triggers.some((trigger) => trigger !== '__always__' && lower.includes(trigger.toLowerCase()));
  });
}

async function walkSkillDir(dir: string, scope: 'project' | 'user'): Promise<DiscoveredSkill[]> {
  const exists = await stat(dir).then(() => true, () => false);
  if (!exists) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results: DiscoveredSkill[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkSkillDir(full, scope)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await readFile(full, 'utf8');
    const parsed = parseFrontMatter(content);
    const fallbackName = entry.name.replace(/\.md$/, '');
    const triggers = parsed.frontMatter.triggers ?? [];
    if (parsed.frontMatter.always === true && !triggers.includes('__always__')) {
      triggers.unshift('__always__');
    }
    results.push({
      name: parsed.frontMatter.name ?? fallbackName,
      ...(parsed.frontMatter.description ? { description: parsed.frontMatter.description } : {}),
      triggers,
      scope,
      filePath: full,
      body: parsed.body,
    });
  }
  return results;
}

/**
 * Parse a tiny subset of YAML front matter — string scalars and string
 * arrays. Sufficient for `name`, `description`, `triggers`, `always`.
 */
export function parseFrontMatter(content: string): { frontMatter: FrontMatter; body: string } {
  if (!content.startsWith('---')) {
    return { frontMatter: {}, body: content };
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) {
    return { frontMatter: {}, body: content };
  }
  const yaml = content.slice(3, end).replace(/^\n/, '');
  const body = content.slice(end + 4).replace(/^\n/, '');
  const fm: FrontMatter = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1] ?? '';
    const value = (match[2] ?? '').trim();
    if (!value) {
      // Possibly a list literal in the next lines (- entry).
      const list: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j] ?? '';
        const itemMatch = next.match(/^\s*-\s+(.+)$/);
        if (!itemMatch) break;
        list.push(stripQuotes((itemMatch[1] ?? '').trim()));
        j += 1;
      }
      assignFrontMatter(fm, key, list.length > 0 ? list : '');
      i = j;
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
      assignFrontMatter(fm, key, items);
    } else {
      assignFrontMatter(fm, key, stripQuotes(value));
    }
    i += 1;
  }
  return { frontMatter: fm, body };
}

function assignFrontMatter(fm: FrontMatter, key: string, value: string | string[]): void {
  if (key === 'always' && typeof value === 'string') {
    fm.always = value === 'true';
    return;
  }
  fm[key] = value;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
