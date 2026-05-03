import { describe, expect, it } from 'vitest';
import { statusLine, formatThinkingBlock, formatToolCallHeader, formatToolResult, formatDiffOutput, modeIndicator, SPLASH, MODE_LABELS, formatWorkflowSummary } from '../src/ui/theme.js';
import type { RuntimeConfig, SessionRecord, ToolDefinition } from '../src/types.js';

const config: RuntimeConfig = {
  apiKey: 'key',
  baseUrl: 'https://api.xiaomimimo.com',
  model: 'mimo-v2.5-pro',
  format: 'anthropic',
  maxTokens: 4096,
  temperature: 0,
};

const session: SessionRecord = {
  id: '12345678-abcd-efgh-ijkl',
  title: 'Test',
  cwd: '/tmp',
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const tools: ToolDefinition[] = [
  { name: 'test', description: 'test', inputSchema: { type: 'object' }, run: async () => 'ok' },
];

describe('theme', () => {
  it('SPLASH contains branding text', () => {
    expect(SPLASH).toContain('Welcome to MiMo Code');
    expect(SPLASH).toContain('/settings for config');
  });

  it('MODE_LABELS has all three modes', () => {
    expect(MODE_LABELS.plan).toBeDefined();
    expect(MODE_LABELS.agent).toBeDefined();
    expect(MODE_LABELS.yolo).toBeDefined();
  });

  it('statusLine includes model name', () => {
    const line = statusLine(config, session, tools, {}, '/tmp');
    expect(line).toContain('mimo-v2.5-pro');
  });

  it('statusLine with mode and cost', () => {
    const cost = { inputCost: 0.001, outputCost: 0.005, totalCost: 0.006, currency: 'USD' };
    const line = statusLine(config, session, tools, {}, '/tmp', 'yolo', cost);
    expect(line).toContain('$');
  });

  it('formatThinkingBlock wraps thinking lines', () => {
    const result = formatThinkingBlock('I need to analyze this');
    expect(result).toContain('·');
    expect(result).toContain('analyze');
  });

  it('formatToolCallHeader shows name and args', () => {
    const result = formatToolCallHeader('read_file', { path: '/tmp/test.txt' });
    expect(result).toContain('read_file');
    expect(result).toContain('path');
  });

  it('formatToolResult truncates long output', () => {
    const longOutput = 'x\n'.repeat(30);
    const result = formatToolResult('test', longOutput);
    expect(result).toContain('more lines');
  });

  it('formatDiffOutput colors diff lines', () => {
    const diff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n';
    const result = formatDiffOutput(diff);
    expect(result).toContain('old');
    expect(result).toContain('new');
  });

  it('modeIndicator shows icon and label', () => {
    expect(modeIndicator('plan')).toContain('◇');
    expect(modeIndicator('agent')).toContain('◆');
    expect(modeIndicator('yolo')).toContain('▲');
  });

  it('formats workflow summary counts', () => {
    const summary = formatWorkflowSummary({
      builtinTools: 10,
      mcpServers: 1,
      mcpTools: 2,
      configuredSkills: 3,
      discoveredSkills: 4,
      hooks: 5,
      subagents: 6,
    });
    expect(summary).toContain('MCP tools');
    expect(summary).toContain('2');
    expect(summary).toContain('Named subagents');
  });
});
