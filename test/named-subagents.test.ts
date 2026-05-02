import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverNamedSubagents } from '../src/agent/named-subagents.js';

describe('discoverNamedSubagents', () => {
  it('reads named subagents from .mimo/agents directory', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-agents-'));
    const dir = path.join(cwd, '.mimo', 'agents');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'researcher.md'),
      `---
name: researcher
description: investigates topics
tools: [read_file, search_text]
max_iterations: 12
---
You are a research assistant. Read carefully and cite sources.`,
      'utf8',
    );
    const agents = await discoverNamedSubagents(cwd);
    expect(agents.length).toBe(1);
    expect(agents[0]?.name).toBe('researcher');
    expect(agents[0]?.tools).toEqual(['read_file', 'search_text']);
    expect(agents[0]?.maxIterations).toBe(12);
    expect(agents[0]?.systemPrompt).toContain('research assistant');
  });

  it('returns empty list when no agents directory exists', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-agents-empty-'));
    process.env.HOME = cwd;
    const agents = await discoverNamedSubagents(cwd);
    expect(agents).toEqual([]);
  });
});
