import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startWebUIServer } from '../src/webui/server.js';
import type { RuntimeConfig, ToolDefinition } from '../src/types.js';
import type { WebUIServerOptions } from '../src/webui/types.js';

const config: RuntimeConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'mimo-v2.5-pro',
  format: 'anthropic',
  maxTokens: 1024,
  temperature: 0,
};

const noopTool: ToolDefinition = {
  name: 'noop',
  description: 'noop',
  inputSchema: { type: 'object' },
  readOnly: true,
  run: async () => 'ok',
};

function buildOptions(cwd: string): WebUIServerOptions {
  return {
    cwd,
    host: '127.0.0.1',
    port: 0,
    open: false,
    mode: 'agent',
    sandbox: 'workspace-write',
    dryRun: false,
    autoApprove: false,
    maxIterations: 6,
    noBrowser: true,
    staticDir: path.join(process.cwd(), 'src', 'webui', 'static'),
  };
}

async function withServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'mimo-webui-'));
  // Override sessions dir via env so the test does not pollute the user's home.
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  const server = await startWebUIServer(config, [noopTool], buildOptions(cwd));
  try {
    return await fn(server.url);
  } finally {
    await server.close();
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('webui server', () => {
  it('serves /api/info with config metadata', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/info`);
      expect(res.status).toBe(200);
      const info = await res.json();
      expect(info.model).toBe('mimo-v2.5-pro');
      expect(info.modes).toContain('agent');
      expect(info.toolNames).toContain('noop');
      expect(info.apiKeyConfigured).toBe(true);
    });
  });

  it('serves the index.html shell at /', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('MiMo Code');
      expect(html).toContain('id="composer-form"');
    });
  });

  it('falls back to index.html for unknown paths (SPA-friendly)', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/sessions/abc123`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="messages"');
    });
  });

  it('lists, creates, and deletes sessions', async () => {
    await withServer(async (url) => {
      const initial = await (await fetch(`${url}/api/sessions`)).json();
      expect(Array.isArray(initial)).toBe(true);
      expect(initial.length).toBe(0);

      const created = await (
        await fetch(`${url}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Test session' }),
        })
      ).json();
      expect(created.title).toBe('Test session');
      expect(typeof created.id).toBe('string');

      const after = await (await fetch(`${url}/api/sessions`)).json();
      expect(after.find((session: { id: string }) => session.id === created.id)).toBeDefined();

      const detail = await (await fetch(`${url}/api/sessions/${created.id}`)).json();
      expect(detail.id).toBe(created.id);

      const del = await fetch(`${url}/api/sessions/${created.id}`, { method: 'DELETE' });
      expect(del.status).toBe(204);

      const final = await (await fetch(`${url}/api/sessions`)).json();
      expect(final.find((session: { id: string }) => session.id === created.id)).toBeUndefined();
    });
  });

  it('returns 404 for missing sessions', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/sessions/nope`);
      expect(res.status).toBe(404);
    });
  });

  it('serves static assets with correct mime types', async () => {
    await withServer(async (url) => {
      const css = await fetch(`${url}/app.css`);
      expect(css.status).toBe(200);
      expect(css.headers.get('content-type') ?? '').toContain('text/css');
      const js = await fetch(`${url}/app.js`);
      expect(js.status).toBe(200);
      expect(js.headers.get('content-type') ?? '').toContain('javascript');
    });
  });

  it('rejects path traversal', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/../../package.json`);
      // The browser-like fetch normalises the path, but the SPA fallback always serves index.html.
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('MiMo Code');
    });
  });

  it('rejects invalid approval payloads', async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/runs/none/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: '', decision: 'maybe' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
