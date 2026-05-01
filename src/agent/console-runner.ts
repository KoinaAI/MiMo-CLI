import chalk from 'chalk';
import ora from 'ora';
import { CodingAgent } from './agent.js';
import { formatUsage } from './usage.js';
import type { AgentOptions, AgentResult, RuntimeConfig, ToolDefinition } from '../types.js';
import { printBanner } from '../ui/banner.js';

export async function runConsoleAgent(
  task: string,
  config: RuntimeConfig,
  tools: ToolDefinition[],
  options: AgentOptions,
): Promise<AgentResult> {
  printBanner(config, options.cwd);
  const agent = new CodingAgent(config, tools, options);
  let spinner: ReturnType<typeof ora> | undefined;
  const result = await agent.run(task, {
    onEvent(event) {
      if (event.type === 'thinking') {
        spinner?.stop();
        spinner = ora(`Thinking (${event.iteration}/${event.maxIterations})`).start();
        return;
      }
      spinner?.stop();
      spinner = undefined;
      if (event.type === 'assistant_message') {
        console.log(chalk.cyan('\nMiMo:'), event.content);
      } else if (event.type === 'tool_call') {
        console.log(chalk.gray(`\n→ ${event.name} ${JSON.stringify(event.input)}`));
      } else if (event.type === 'tool_result') {
        console.log(chalk.gray(truncate(event.content, 3000)));
      } else if (event.type === 'error') {
        console.log(chalk.red(event.message));
      }
    },
  });
  spinner?.stop();
  console.log(chalk.gray(`\nToken usage: ${formatUsage(result.usage)}`));
  return result;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n…[truncated]`;
}
