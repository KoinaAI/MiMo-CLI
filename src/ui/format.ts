import type { AgentEvent } from '../types.js';

export function summarizeToolInput(input: Record<string, unknown>, maxLength = 180): string {
  const text = JSON.stringify(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function summarizeToolOutput(output: string, maxLength = 500): string {
  if (output.length <= maxLength) return output;
  return `${output.slice(0, maxLength)}\n…[truncated]`;
}

export function eventLabel(event: AgentEvent): string {
  switch (event.type) {
    case 'thinking':
      return `Thinking ${event.iteration}/${event.maxIterations}`;
    case 'assistant_message':
      return 'MiMo';
    case 'tool_call':
      return `Tool ${event.name}`;
    case 'tool_result':
      return `Result ${event.name}`;
    case 'error':
      return 'Error';
    case 'done':
      return 'Done';
  }
}
