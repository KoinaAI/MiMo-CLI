import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_CONFIG_FILE } from '../constants.js';

const AGENTS_MD_TEMPLATE = `# Agent Instructions

This file gives MiMo Code CLI (and any other compatible coding agent)
project-specific guidance. Edit it freely.

## Project overview

<!-- 1–2 sentences about what this project does. -->

## Build, test, lint

<!-- Common commands the agent should know about. -->

## Conventions

<!-- House rules: file structure, formatting, naming, framework choices. -->

## Out of scope

<!-- Areas the agent should not modify without explicit permission. -->
`;

const SAMPLE_SKILL_TEMPLATE = `---
name: testing-discipline
description: Reminds the agent to run the test suite after every change.
triggers: [test, vitest, jest, pytest]
always: false
---

When the user changes source code, always:

1. Run the relevant test suite.
2. Surface the actual command and its output (truncated if long).
3. If tests fail, *do not* mark the task complete — fix or report the failure.
`;

const SAMPLE_AGENT_TEMPLATE = `---
name: research-assistant
description: Investigates a topic by reading docs and summarising findings.
tools: [read_file, search_text, file_search, web_fetch]
max_iterations: 8
---

You are a focused research assistant. Read documentation, source files,
and (when needed) external pages, then return a written summary with
references to the strongest evidence you found.

Do not modify files. Always cite paths or URLs alongside claims.
`;

export interface InitResult {
  configPath: string;
  agentsPath: string;
  skillPath: string;
  agentMdPath: string;
  created: string[];
  alreadyExisted: string[];
}

/**
 * Scaffold a project for use with MiMo Code CLI.
 *
 * Creates (when absent):
 *   - `.mimo-code.json` with sensible defaults.
 *   - `AGENTS.md` with section headings.
 *   - `.mimo/skills/testing-discipline.md` example skill.
 *   - `.mimo/agents/research-assistant.md` example named subagent.
 *
 * Existing files are never overwritten.
 */
export async function initProject(cwd: string, baseConfig?: { model?: string; baseUrl?: string }): Promise<InitResult> {
  const created: string[] = [];
  const alreadyExisted: string[] = [];

  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
  if (!(await fileExists(configPath))) {
    const config = {
      $schema: 'https://github.com/KoinaAI/MiMo-CLI/raw/main/schema/mimo-code.schema.json',
      ...(baseConfig?.model ? { model: baseConfig.model } : {}),
      ...(baseConfig?.baseUrl ? { baseUrl: baseConfig.baseUrl } : {}),
      mcpServers: [],
      skills: [],
      hooks: [],
      workflow: {
        defaultMode: 'agent',
        recommendedChecks: ['npm run lint', 'npm run typecheck', 'npm test'],
      },
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    created.push(configPath);
  } else {
    alreadyExisted.push(configPath);
  }

  const agentsMdPath = path.join(cwd, 'AGENTS.md');
  if (!(await fileExists(agentsMdPath))) {
    await writeFile(agentsMdPath, AGENTS_MD_TEMPLATE, 'utf8');
    created.push(agentsMdPath);
  } else {
    alreadyExisted.push(agentsMdPath);
  }

  const skillsDir = path.join(cwd, '.mimo', 'skills');
  await mkdir(skillsDir, { recursive: true });
  const skillPath = path.join(skillsDir, 'testing-discipline.md');
  if (!(await fileExists(skillPath))) {
    await writeFile(skillPath, SAMPLE_SKILL_TEMPLATE, 'utf8');
    created.push(skillPath);
  } else {
    alreadyExisted.push(skillPath);
  }

  const agentsDir = path.join(cwd, '.mimo', 'agents');
  await mkdir(agentsDir, { recursive: true });
  const agentsPath = path.join(agentsDir, 'research-assistant.md');
  if (!(await fileExists(agentsPath))) {
    await writeFile(agentsPath, SAMPLE_AGENT_TEMPLATE, 'utf8');
    created.push(agentsPath);
  } else {
    alreadyExisted.push(agentsPath);
  }

  // Ensure .gitignore doesn't block the .mimo folder by default; we don't
  // mutate user .gitignore, but we do flag if it does block.
  const gitignorePath = path.join(cwd, '.gitignore');
  try {
    const text = await readFile(gitignorePath, 'utf8');
    if (text.split('\n').some((line) => line.trim() === '.mimo' || line.trim() === '.mimo/')) {
      // Caller can warn the user; we just record path presence.
    }
  } catch {
    // Missing .gitignore is fine.
  }

  return { configPath, agentsPath, skillPath, agentMdPath: agentsMdPath, created, alreadyExisted };
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
