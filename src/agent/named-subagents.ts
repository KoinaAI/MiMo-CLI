import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { USER_CONFIG_DIR } from '../constants.js';
import { parseFrontMatter } from '../skills/discover.js';
import { CodingAgent } from './agent.js';
import { runHooks } from '../hooks.js';
import type { AgentEvent, AgentResult, RuntimeConfig, ToolDefinition } from '../types.js';

/**
 * A named subagent declared in `.mimo/agents/*.md` (project-scoped) or
 * `~/.mimo-code/agents/*.md` (user-scoped). The Markdown body becomes the
 * subagent's system prompt, and the YAML frontmatter declares metadata.
 *
 * Supported frontmatter keys:
 *
 *   name: research-assistant
 *   description: Investigates a topic and produces a written summary.
 *   tools: [read_file, search_text, web_fetch]
 *   max_iterations: 10
 */
export interface NamedSubagent {
  name: string;
  description?: string;
  /** Optional tool allow-list. When omitted the subagent inherits all tools. */
  tools?: string[];
  maxIterations: number;
  systemPrompt: string;
  filePath: string;
  scope: 'project' | 'user';
}

export async function discoverNamedSubagents(cwd: string): Promise<NamedSubagent[]> {
  const userDir = path.join(homedir(), USER_CONFIG_DIR, 'agents');
  const projectDir = path.join(cwd, '.mimo', 'agents');
  const [user, project] = await Promise.all([walk(userDir, 'user'), walk(projectDir, 'project')]);
  const merged = new Map<string, NamedSubagent>();
  for (const agent of user) merged.set(agent.name, agent);
  for (const agent of project) merged.set(agent.name, agent);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function walk(dir: string, scope: 'project' | 'user'): Promise<NamedSubagent[]> {
  const exists = await stat(dir).then(() => true, () => false);
  if (!exists) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: NamedSubagent[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const full = path.join(dir, entry.name);
    const content = await readFile(full, 'utf8');
    const parsed = parseFrontMatter(content);
    const fm = parsed.frontMatter as { name?: string; description?: string; tools?: string[]; max_iterations?: string | number };
    const fallbackName = entry.name.replace(/\.md$/, '');
    const maxRaw = fm.max_iterations;
    const maxIterations = typeof maxRaw === 'number' ? maxRaw : typeof maxRaw === 'string' ? Number(maxRaw) || 6 : 6;
    out.push({
      name: fm.name ?? fallbackName,
      ...(fm.description ? { description: fm.description } : {}),
      ...(Array.isArray(fm.tools) ? { tools: fm.tools } : {}),
      maxIterations,
      systemPrompt: parsed.body.trim(),
      filePath: full,
      scope,
    });
  }
  return out;
}

export interface RunNamedSubagentOptions {
  cwd: string;
  parentConfig: RuntimeConfig;
  allTools: ToolDefinition[];
  task: string;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Spawn a named subagent. Tools are filtered down to the subagent's
 * declared allow-list (or inherited fully when no list is given). The
 * subagent's system prompt is the Markdown body; the parent's runtime
 * config (model, temperature, etc.) is reused.
 */
export async function runNamedSubagent(agent: NamedSubagent, options: RunNamedSubagentOptions): Promise<AgentResult> {
  const subTools = agent.tools
    ? options.allTools.filter((tool) => agent.tools?.includes(tool.name))
    : options.allTools;
  const config: RuntimeConfig = { ...options.parentConfig, systemPrompt: agent.systemPrompt };
  const subAgent = new CodingAgent(config, subTools, {
    cwd: options.cwd,
    dryRun: false,
    autoApprove: true,
    maxIterations: agent.maxIterations,
    mode: 'agent',
  });
  const result = await subAgent.run(options.task, options.onEvent ? { onEvent: options.onEvent } : {});
  await runHooks(options.parentConfig.hooks, 'subagent_done', { cwd: options.cwd, prompt: options.task, finalMessage: result.finalMessage });
  return result;
}

/**
 * Build a single dispatch tool that lets the parent agent invoke any
 * discovered named subagent by name. Exposed alongside the generic
 * `sub_agent` so existing prompts continue to work.
 */
export function createNamedSubagentTool(parentConfig: RuntimeConfig, allTools: ToolDefinition[], agents: NamedSubagent[]): ToolDefinition {
  const namesList = agents.map((agent) => `${agent.name}${agent.description ? ` — ${agent.description}` : ''}`).join('\n');
  return {
    name: 'agent_dispatch',
    description:
      `Dispatch a named subagent declared in .mimo/agents/. Subagents have their own system prompts and tool allow-lists. Available agents:\n${namesList || '(none discovered)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Subagent name (matches the discovered set).' },
        task: { type: 'string', description: 'Task description for the subagent.' },
      },
      required: ['name', 'task'],
      additionalProperties: false,
    },
    async run(input, context) {
      const name = typeof input.name === 'string' ? input.name : '';
      const task = typeof input.task === 'string' ? input.task : '';
      if (!name || !task) return 'agent_dispatch: missing name or task.';
      const target = agents.find((agent) => agent.name === name);
      if (!target) return `agent_dispatch: no agent named "${name}". Available: ${agents.map((agent) => agent.name).join(', ') || '(none)'}`;
      if (context.dryRun) return `[dry-run] Would dispatch agent "${name}" for: ${task}`;
      const result = await runNamedSubagent(target, {
        cwd: context.cwd,
        parentConfig,
        allTools,
        task,
      });
      return `Subagent "${name}" finished in ${result.iterations} iterations.\n\n${result.finalMessage}`;
    },
  };
}
