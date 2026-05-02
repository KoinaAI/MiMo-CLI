import { CodingAgent } from './agent.js';
import type { AgentEvent, AgentResult, RuntimeConfig, SubAgentConfig, ToolDefinition } from '../types.js';
import { runHooks } from '../hooks.js';

export interface SubAgentResult {
  task: string;
  result: AgentResult;
  events: AgentEvent[];
}

export async function runSubAgent(
  parentConfig: RuntimeConfig,
  subConfig: SubAgentConfig,
  cwd: string,
  onEvent?: (event: AgentEvent) => void,
): Promise<SubAgentResult> {
  const events: AgentEvent[] = [];
  const agent = new CodingAgent(
    parentConfig,
    subConfig.tools,
    {
      cwd,
      dryRun: false,
      maxIterations: subConfig.maxIterations ?? 5,
      autoApprove: true,
      mode: 'agent',
    },
  );
  const result = await agent.run(subConfig.task, {
    onEvent: (event) => {
      events.push(event);
      onEvent?.(event);
    },
  });
  await runHooks(parentConfig.hooks, 'subagent_done', { cwd, prompt: subConfig.task, finalMessage: result.finalMessage });
  return { task: subConfig.task, result, events };
}

export function createSubAgentTool(parentConfig: RuntimeConfig, tools: ToolDefinition[]): ToolDefinition {
  return {
    name: 'sub_agent',
    description: 'Spawn a sub-agent to handle a specific subtask independently. The sub-agent has its own iteration loop and tools. Use for parallelizable or complex subtasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description for the sub-agent.' },
        maxIterations: { type: 'number', description: 'Max iterations for the sub-agent. Default 5.' },
      },
      required: ['task'],
      additionalProperties: false,
    },
    async run(input, context) {
      const task = typeof input.task === 'string' ? input.task : '';
      const maxIterations = typeof input.maxIterations === 'number' ? input.maxIterations : 5;
      if (context.dryRun) {
        return `[dry-run] Would spawn sub-agent for: ${task}`;
      }
      const result = await runSubAgent(parentConfig, { task, tools, maxIterations }, context.cwd);
      return `Sub-agent completed "${task}" in ${result.result.iterations} iterations.\n\nResult: ${result.result.finalMessage}`;
    },
  };
}
