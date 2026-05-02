import { describe, expect, it } from 'vitest';
import { askUserTool } from '../src/tools/ask-user.js';
import type { ToolContext } from '../src/types.js';

const context: ToolContext = { cwd: '/tmp', dryRun: false, autoApprove: true };

describe('ask_user tool', () => {
  it('returns waiting message with question', async () => {
    const result = await askUserTool.run({ question: 'What is your name?' }, context);
    expect(result).toContain('Waiting for user response');
    expect(result).toContain('What is your name?');
  });

  it('is read-only', () => {
    expect(askUserTool.readOnly).toBe(true);
  });
});
