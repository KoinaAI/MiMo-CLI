#!/usr/bin/env node
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { runConsoleAgent } from './agent/console-runner.js';
import { createSubAgentTool } from './agent/subagent.js';
import { configureInteractively } from './config/interactive.js';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, SUPPORTED_MODELS } from './constants.js';
import { loadConfig, tokenPlanBaseUrl } from './config/config.js';
import { runHooks } from './hooks.js';
import { createMcpTools } from './mcp/stdio.js';
import { defaultTools } from './tools/index.js';
import type { ApiFormat, InteractionMode, PersistedConfig } from './types.js';
import { errorMessage } from './utils/errors.js';
import { runTui } from './ui/tui.js';

const program = new Command();

program
  .name('mimo-code')
  .description('Terminal coding agent powered by Xiaomi MiMo models')
  .version('0.1.0')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .option('--model <model>', `model (${SUPPORTED_MODELS.join(', ')})`)
  .option('--base-url <url>', 'MiMo base URL')
  .option('--token-plan-region <region>', 'Token Plan region: cn, sgp, ams')
  .option('--format <format>', 'API format: openai or anthropic')
  .option('--max-tokens <number>', `max output tokens (default ${DEFAULT_MAX_TOKENS})`)
  .option('--temperature <number>', `sampling temperature (default ${DEFAULT_TEMPERATURE})`)
  .option('--dry-run', 'show writes and commands without changing files', false)
  .option('-y, --yes', 'auto-approve tool calls where possible', false)
  .option('--max-iterations <number>', 'maximum agent/tool loop iterations (default 12)')
  .option('--no-tui', 'use prompt-based console mode instead of the full TUI')
  .option('--mode <mode>', 'interaction mode: plan, agent, or yolo (default agent)')
  .action(async (options) => {
    await runInteractive(options);
  });

program
  .command('run')
  .description('Run a single task non-interactively')
  .argument('<task...>', 'task prompt')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .option('--model <model>', `model (${SUPPORTED_MODELS.join(', ')})`)
  .option('--base-url <url>', 'MiMo base URL')
  .option('--token-plan-region <region>', 'Token Plan region: cn, sgp, ams')
  .option('--format <format>', 'API format: openai or anthropic')
  .option('--max-tokens <number>', `max output tokens (default ${DEFAULT_MAX_TOKENS})`)
  .option('--temperature <number>', `sampling temperature (default ${DEFAULT_TEMPERATURE})`)
  .option('--dry-run', 'show writes and commands without changing files', false)
  .option('-y, --yes', 'auto-approve tool calls where possible', false)
  .option('--max-iterations <number>', 'maximum agent/tool loop iterations (default 12)')
  .option('--mode <mode>', 'interaction mode: plan, agent, or yolo (default agent)')
  .action(async (taskParts: string[], options) => {
    await runTask(taskParts.join(' '), options);
  });

program
  .command('config')
  .description('Create or update ~/.mimo-code/config.json')
  .action(async () => {
    const path = await configureInteractively();
    console.log(chalk.green(`Saved config to ${path}`));
  });

program
  .command('models')
  .description('List supported MiMo models')
  .action(() => {
    for (const model of SUPPORTED_MODELS) {
      console.log(model);
    }
  });

program
  .command('base-url')
  .description('Print a base URL for API or Token Plan usage')
  .option('--region <region>', 'Token Plan region: cn, sgp, ams')
  .action((options) => {
    console.log(options.region ? tokenPlanBaseUrl(options.region) : 'https://api.xiaomimimo.com');
  });

const mcpCmd = program
  .command('mcp')
  .description('Manage MCP server configurations');

mcpCmd
  .command('list')
  .description('List configured MCP servers')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const config = await loadConfig(options.cwd ?? process.cwd());
    const servers = config.mcpServers ?? [];
    if (servers.length === 0) {
      console.log('No MCP servers configured.');
      return;
    }
    for (const server of servers) {
      const status = server.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]');
      console.log(`  ${status} ${chalk.bold(server.name)} — ${server.command} ${(server.args ?? []).join(' ')}`);
    }
  });

const skillsCmd = program
  .command('skills')
  .description('Manage skill configurations');

skillsCmd
  .command('list')
  .description('List configured skills')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const config = await loadConfig(options.cwd ?? process.cwd());
    const skills = config.skills ?? [];
    if (skills.length === 0) {
      console.log('No skills configured.');
      return;
    }
    for (const skill of skills) {
      const status = skill.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]');
      console.log(`  ${status} ${chalk.bold(skill.name)} — ${skill.description ?? skill.path ?? 'no description'}`);
    }
  });

program
  .command('doctor')
  .description('Run diagnostic checks')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const { runDiagnostics, formatDiagnostics } = await import('./doctor/checks.js');
    const config = await loadConfig(options.cwd ?? process.cwd());
    const results = await runDiagnostics(config, options.cwd ?? process.cwd());
    console.log(formatDiagnostics(results));
  });

async function runTask(task: string, options: CliOptions): Promise<void> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const overrides = parseOverrides(options);
    const config = await loadConfig(cwd, overrides);
    const mcpTools = await createMcpTools(config.mcpServers, cwd);
    const allTools = [...defaultTools, ...mcpTools];
    const subAgentTool = createSubAgentTool(config, allTools);
    const tools = [...allTools, subAgentTool];
    const mode = parseMode(options.mode);
    await runConsoleAgent(task, config, tools, {
      cwd,
      dryRun: Boolean(options.dryRun),
      autoApprove: mode === 'yolo' || Boolean(options.yes),
      maxIterations: parsePositiveInteger(options.maxIterations ?? '12', '--max-iterations'),
      mode,
    });
  } catch (error) {
    console.error(chalk.red(errorMessage(error)));
    process.exitCode = 1;
  }
}

async function runInteractive(options: CliOptions): Promise<void> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const overrides = parseOverrides(options);
    const config = await loadConfig(cwd, overrides);
    const mcpTools = await createMcpTools(config.mcpServers, cwd);
    const allTools = [...defaultTools, ...mcpTools];
    const subAgentTool = createSubAgentTool(config, allTools);
    const tools = [...allTools, subAgentTool];
    const mode = parseMode(options.mode);
    const agentOptions = {
      cwd,
      dryRun: Boolean(options.dryRun),
      autoApprove: mode === 'yolo' || Boolean(options.yes),
      maxIterations: parsePositiveInteger(options.maxIterations ?? '12', '--max-iterations'),
      mode,
    };
    if (options.tui === false) {
      const task = await input({ message: 'What should MiMo Code do?' });
      await runConsoleAgent(task, config, tools, agentOptions);
      return;
    }
    await runHooks(config.hooks, 'session_start', { cwd });
    await runTui(config, tools, agentOptions);
  } catch (error) {
    console.error(chalk.red(errorMessage(error)));
    process.exitCode = 1;
  }
}

function parseOverrides(options: CliOptions): PersistedConfig {
  const overrides: PersistedConfig = {};
  if (options.model) overrides.model = options.model;
  if (options.baseUrl) overrides.baseUrl = options.baseUrl;
  if (options.tokenPlanRegion) overrides.baseUrl = tokenPlanBaseUrl(options.tokenPlanRegion);
  if (options.format) overrides.format = options.format as ApiFormat;
  if (options.maxTokens) overrides.maxTokens = parsePositiveInteger(options.maxTokens, '--max-tokens');
  if (options.temperature) overrides.temperature = parseNonNegativeNumber(options.temperature, '--temperature');
  return overrides;
}

function parseMode(value?: string): InteractionMode {
  if (value === 'plan' || value === 'agent' || value === 'yolo') return value;
  return 'agent';
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, name: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

interface CliOptions {
  cwd?: string;
  model?: string;
  baseUrl?: string;
  tokenPlanRegion?: string;
  format?: string;
  maxTokens?: string;
  temperature?: string;
  dryRun?: boolean;
  yes?: boolean;
  maxIterations?: string;
  tui?: boolean;
  mode?: string;
}

await program.parseAsync();
