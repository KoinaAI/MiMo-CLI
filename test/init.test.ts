import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from '../src/config/init.js';

describe('initProject', () => {
  it('creates config, AGENTS.md, sample skill and sample agent', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-init-'));
    const result = await initProject(cwd);
    expect(result.created).toContain(result.configPath);
    expect(result.created).toContain(result.agentMdPath);
    expect(result.created).toContain(result.skillPath);
    expect(result.created).toContain(result.agentsPath);

    const config = JSON.parse(await readFile(result.configPath, 'utf8')) as Record<string, unknown>;
    expect(config).toHaveProperty('mcpServers');
    expect(config).toHaveProperty('skills');
    expect(config).toHaveProperty('hooks');

    const agentsMd = await readFile(result.agentMdPath, 'utf8');
    expect(agentsMd).toContain('Agent Instructions');
  });

  it('does not overwrite existing files', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-init-existing-'));
    const configPath = path.join(cwd, '.mimo-code.json');
    await writeFile(configPath, '{"keep": true}', 'utf8');
    const result = await initProject(cwd);
    expect(result.alreadyExisted).toContain(configPath);
    const content = await readFile(configPath, 'utf8');
    expect(content).toBe('{"keep": true}');
  });
});
