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

  it('merges system messages from the messages array into the system field', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
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
      systemPrompt: 'BASE_SYSTEM',
    };
    const client = new MiMoClient(config);
    await client.complete(
      [
        { role: 'system', content: 'BASE_SYSTEM' }, // duplicate of config.systemPrompt
        { role: 'system', content: 'PROJECT_CONTEXT_FROM_AGENTS_MD' },
        { role: 'system', content: 'SKILLS_LOADED' },
        { role: 'user', content: 'hello' },
      ],
      [],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.body).toBeTypeOf('string');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    const system = body.system;
    expect(typeof system).toBe('string');
    expect(system).toContain('BASE_SYSTEM');
    expect(system).toContain('PROJECT_CONTEXT_FROM_AGENTS_MD');
    expect(system).toContain('SKILLS_LOADED');
    // Duplicate of config.systemPrompt must not appear twice.
    const matches = (system as string).match(/BASE_SYSTEM/g) ?? [];
    expect(matches.length).toBe(1);
    // System messages must NOT be forwarded as part of the messages array.
    expect(Array.isArray(body.messages)).toBe(true);
    for (const message of body.messages as { role: string }[]) {
      expect(message.role).not.toBe('system');
    }
  });

  it('omits the system field when no system content is provided', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 }),
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
    const client = new MiMoClient(config);
    await client.complete([{ role: 'user', content: 'hi' }], []);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.system).toBeUndefined();
  });
});
