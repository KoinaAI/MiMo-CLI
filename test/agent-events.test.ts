import { describe, expect, it } from 'vitest';
import { CodingAgent } from '../src/agent/agent.js';
import type { AgentEvent, RuntimeConfig, ToolDefinition } from '../src/types.js';

const config: RuntimeConfig = {
  apiKey: 'key',
  baseUrl: 'https://api.xiaomimimo.com',
  model: 'mimo-v2.5-pro',
  format: 'openai',
  maxTokens: 4096,
  temperature: 0,
};

describe('CodingAgent events', () => {
  it('emits errors when API calls fail', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    const events: AgentEvent[] = [];
    const agent = new CodingAgent(config, [], { cwd: process.cwd(), dryRun: false, autoApprove: true, maxIterations: 1 });
    await expect(agent.run('hello', { onEvent: (event) => events.push(event) })).rejects.toThrow(/boom/);
    expect(events.some((event) => event.type === 'thinking')).toBe(true);
    expect(events.some((event) => event.type === 'error' && event.message.includes('boom'))).toBe(true);
    globalThis.fetch = originalFetch;
  });

  it('asks approval for mutating tools', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call-1',
                      function: { name: 'write_file', arguments: '{"path":"x.txt","content":"x"}' },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }), { status: 200 });
    };
    const tool: ToolDefinition = {
      name: 'write_file',
      description: 'write',
      inputSchema: { type: 'object' },
      run: async () => 'wrote',
    };
    const agent = new CodingAgent(config, [tool], { cwd: process.cwd(), dryRun: false, autoApprove: false, maxIterations: 2 });
    let approved = false;
    const result = await agent.run('write', {
      approveToolCall: async () => {
        approved = true;
        return 'approve';
      },
    });
    expect(approved).toBe(true);
    expect(result.finalMessage).toBe('done');
    globalThis.fetch = originalFetch;
  });

  it('emits hook results during tool workflow', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call-1',
                      function: { name: 'read_file', arguments: '{"path":"README.md"}' },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }), { status: 200 });
    };
    const events: AgentEvent[] = [];
    const tool: ToolDefinition = {
      name: 'read_file',
      description: 'read',
      inputSchema: { type: 'object' },
      readOnly: true,
      run: async () => 'content',
    };
    const agent = new CodingAgent(
      {
        ...config,
        hooks: [{ name: 'echo', event: 'before_tool', command: 'node', args: ['-e', 'process.stdout.write("hooked")'] }],
      },
      [tool],
      { cwd: process.cwd(), dryRun: false, autoApprove: true, maxIterations: 2 },
    );
    await agent.run('read', { onEvent: (event) => events.push(event) });
    expect(events.some((event) => event.type === 'hook_result' && event.hook === 'echo' && event.output === 'hooked')).toBe(true);
    globalThis.fetch = originalFetch;
  });
});
