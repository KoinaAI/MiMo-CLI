import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMcpTools } from '../src/mcp/stdio.js';

describe('createMcpTools', () => {
  it('discovers and calls stdio MCP tools', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-mcp-'));
    const server = path.join(cwd, 'server.cjs');
    await writeFile(
      server,
      `process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {}}));
    if (msg.method === 'tools/list') console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {tools:[{name:'echo', description:'Echo input', inputSchema:{type:'object'}}]}}));
    if (msg.method === 'tools/call') console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {content:[{type:'text', text: msg.params.arguments.text}]}}));
  }
});`,
    );
    const tools = await createMcpTools([{ name: 'test', command: 'node', args: [server] }], cwd);
    expect(tools.map((tool) => tool.name)).toEqual(['mcp__test__echo']);
    await expect(tools[0]?.run({ text: 'ok' }, { cwd, dryRun: false, autoApprove: true })).resolves.toBe('ok');
  });

  it('survives non-JSON lines emitted by an MCP server on stdout', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-mcp-'));
    const server = path.join(cwd, 'server.cjs');
    await writeFile(
      server,
      `process.stdin.setEncoding('utf8');
let buffer = '';
console.log('startup banner: not json');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      console.log('warning: misc log between responses');
      console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {}}));
    }
    if (msg.method === 'tools/list') console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {tools:[{name:'echo', description:'Echo input', inputSchema:{type:'object'}}]}}));
    if (msg.method === 'tools/call') console.log(JSON.stringify({jsonrpc:'2.0', id: msg.id, result: {content:[{type:'text', text: msg.params.arguments.text}]}}));
  }
});`,
    );
    const tools = await createMcpTools([{ name: 'test', command: 'node', args: [server] }], cwd);
    expect(tools.map((tool) => tool.name)).toEqual(['mcp__test__echo']);
    await expect(tools[0]?.run({ text: 'ok' }, { cwd, dryRun: false, autoApprove: true })).resolves.toBe('ok');
  });
});
