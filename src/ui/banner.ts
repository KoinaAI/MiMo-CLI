import chalk from 'chalk';
import { formatUsage } from '../agent/usage.js';
import type { RuntimeConfig, TokenUsage } from '../types.js';

export function printBanner(config: RuntimeConfig, cwd: string): void {
  console.log(chalk.bold('MiMo Code CLI'));
  console.log(chalk.gray(`model=${config.model} format=${config.format} baseUrl=${config.baseUrl}`));
  console.log(chalk.gray(`workspace=${cwd}`));
}

export function printUsage(usage: TokenUsage): void {
  console.log(chalk.gray(`\nToken usage: ${formatUsage(usage)}`));
}
