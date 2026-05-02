import { describe, expect, it } from 'vitest';
import { McpRegistry, getMcpRegistry } from '../src/mcp/registry.js';

describe('McpRegistry', () => {
  it('returns an empty tool list when no servers are configured', async () => {
    const registry = new McpRegistry();
    const tools = await registry.start([], process.cwd());
    expect(tools).toEqual([]);
    expect(registry.status()).toEqual([]);
    await registry.stopAll();
  });

  it('skips disabled servers', async () => {
    const registry = new McpRegistry();
    const tools = await registry.start([{ name: 'disabled', command: 'echo', enabled: false }], process.cwd());
    expect(tools).toEqual([]);
    await registry.stopAll();
  });

  it('logs a warning and skips servers that fail to start', async () => {
    const registry = new McpRegistry();
    // /nonexistent-binary will fail to spawn; should not throw.
    const tools = await registry.start(
      [{ name: 'broken', command: '/nonexistent-binary-mimo-test', args: [] }],
      process.cwd(),
    );
    expect(tools).toEqual([]);
    await registry.stopAll();
  });

  it('returns the same instance from the global accessor', () => {
    const a = getMcpRegistry();
    const b = getMcpRegistry();
    expect(a).toBe(b);
  });
});
