import chalk from 'chalk';
import type { AgentEvent } from '../types.js';

export function summarizeToolInput(input: Record<string, unknown>, maxLength = 180): string {
  const entries = Object.entries(input);
  const parts = entries.map(([key, value]) => {
    if (typeof value === 'string') {
      const truncated = value.length > 60 ? value.slice(0, 57) + '...' : value;
      return `${chalk.dim(key)}=${chalk.white(truncated)}`;
    }
    const json = JSON.stringify(value);
    const truncated = json.length > 60 ? json.slice(0, 57) + '...' : json;
    return `${chalk.dim(key)}=${truncated}`;
  });
  const text = parts.join(', ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function summarizeToolOutput(output: string, maxLength = 500): string {
  const lines = output.split('\n');
  if (output.length <= maxLength && lines.length <= 25) return output;

  const lineCount = lines.length;
  const truncatedLines = lines.slice(0, 20);
  const truncated = truncatedLines.join('\n');
  const remaining = lineCount - 20;
  if (remaining > 0) {
    return `${truncated}\n${chalk.dim(`  ... ${remaining} more line(s) (${output.length.toLocaleString()} chars total)`)}`;
  }
  if (output.length > maxLength) {
    return `${output.slice(0, maxLength)}\n${chalk.dim(`  ... truncated (${output.length.toLocaleString()} chars total)`)}`;
  }
  return output;
}

export function eventLabel(event: AgentEvent): string {
  switch (event.type) {
    case 'thinking':
      return `Thinking ${event.iteration}/${event.maxIterations}`;
    case 'assistant_message':
      return 'MiMo';
    case 'assistant_thinking':
      return 'Thinking';
    case 'streaming_delta':
      return 'Streaming';
    case 'tool_call':
      return `Tool ${event.name}`;
    case 'tool_result':
      return `Result ${event.name}`;
    case 'hook_result':
      return `Hook ${event.hook}`;
    case 'error':
      return 'Error';
    case 'done':
      return 'Done';
  }
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${seconds}s`;
}

/**
 * Format a timestamp for display (HH:MM:SS).
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}
