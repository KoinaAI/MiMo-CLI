import type { ToolDefinition } from '../types.js';
import { asString } from '../utils/json.js';

/**
 * ask_user tool — allows the agent to ask the user a question and wait
 * for a response.
 *
 * In the TUI, this emits a special tool_result that contains the user's
 * answer. In console/non-interactive mode, it reads from stdin.
 *
 * Inspired by Gemini CLI's ask-user tool.
 */
export const askUserTool: ToolDefinition = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response. Use when you need clarification, confirmation, or input.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user.' },
    },
    required: ['question'],
    additionalProperties: false,
  },
  async run(input) {
    const question = asString(input.question, 'question');
    // In actual TUI, this is intercepted by the event handler.
    // The agent sees this as a tool that returns the user's answer.
    // The default behavior simply echoes the question, and the TUI
    // replaces this with actual user input.
    return `[Waiting for user response to: ${question}]`;
  },
};

export const askUserTools: ToolDefinition[] = [askUserTool];
