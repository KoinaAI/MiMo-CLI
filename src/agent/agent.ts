import chalk from 'chalk';
import ora from 'ora';
import { MiMoClient } from '../api/client.js';
import type { AgentOptions, AgentResult, ChatMessage, RuntimeConfig, ToolDefinition, TokenUsage } from '../types.js';
import { errorMessage } from '../utils/errors.js';
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
import { mergeUsage } from './usage.js';

export class CodingAgent {
  private readonly client: MiMoClient;
  private readonly systemPrompt: string;

  constructor(
    config: RuntimeConfig,
    private readonly tools: ToolDefinition[],
    private readonly options: AgentOptions,
  ) {
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.client = new MiMoClient({ ...config, systemPrompt: this.systemPrompt });
  }

  async run(task: string): Promise<AgentResult> {
    const systemPrompt = this.systemPrompt;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];
    let finalMessage = '';
    let usage: TokenUsage = {};

    for (let iteration = 1; iteration <= this.options.maxIterations; iteration += 1) {
      const spinner = ora(`Thinking (${iteration}/${this.options.maxIterations})`).start();
      const response = await this.client.complete(messages, this.tools);
      spinner.stop();
      usage = mergeUsage(usage, response.rawUsage);

      if (response.content) {
        finalMessage = response.content;
        console.log(chalk.cyan('\nMiMo:'), response.content.trim());
      }

      if (response.toolCalls.length === 0) {
        return { finalMessage, iterations: iteration, usage };
      }

      messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });

      for (const toolCall of response.toolCalls) {
        const tool = this.tools.find((candidate) => candidate.name === toolCall.name);
        if (!tool) {
          messages.push({ role: 'tool', toolCallId: toolCall.id, name: toolCall.name, content: `Unknown tool: ${toolCall.name}` });
          continue;
        }
        console.log(chalk.gray(`\n→ ${toolCall.name} ${JSON.stringify(toolCall.input)}`));
        const content = await tool.run(toolCall.input, this.options).catch((error: unknown) => `Tool error: ${errorMessage(error)}`);
        console.log(chalk.gray(truncate(content, 3000)));
        messages.push({ role: 'tool', toolCallId: toolCall.id, name: tool.name, content });
      }
    }

    const message = `Stopped after ${this.options.maxIterations} iterations. Ask a more focused question or increase --max-iterations.`;
    return { finalMessage: finalMessage || message, iterations: this.options.maxIterations, usage };
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n…[truncated]`;
}
