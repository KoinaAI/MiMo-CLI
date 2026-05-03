import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiMoClient } from '../src/api/client.js';
import type { RuntimeConfig, ToolDefinition } from '../src/types.js';

describe('MiMoClient Anthropic mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls /anthropic/v1/messages and parses tool calls', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: 'I will inspect files.',
            },
            {
              type: 'tool_use',
              id: 'call-1',
              name: 'list_files',
              input: { path: '.' },
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const config: RuntimeConfig = {
      apiKey: 'key',
      baseUrl: 'https://api.xiaomimimo.com',
      model: 'mimo-v2.5-pro',
      format: 'anthropic',
      maxTokens: 4096,
      temperature: 0,
    };
    const tools: ToolDefinition[] = [
      {
        name: 'list_files',
        description: 'list',
        inputSchema: { type: 'object' },
        run: async () => 'ok',
      },
    ];
    const client = new MiMoClient(config);
    const response = await client.complete([{ role: 'user', content: 'hello' }], tools);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.xiaomimimo.com/anthropic/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.toolCalls).toEqual([{ id: 'call-1', name: 'list_files', input: { path: '.' } }]);
    expect(response.rawUsage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});
