import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { defaultSandboxForMode } from '../policy/sandbox.js';
import {
  createSession,
  deleteSession,
  listSessions,
  readSession,
  saveSession,
} from '../session/store.js';
import { SUPPORTED_MODELS } from '../constants.js';
import type {
  AgentOptions,
  RuntimeConfig,
  SessionRecord,
  ToolApprovalDecision,
  ToolDefinition,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import { mimeFor, resolveStaticDir } from './assets.js';
import { WebRunner } from './runner.js';
import type { ServerInfo, SessionSummary, StreamEvent, WebUIServerOptions } from './types.js';

interface ServerContext {
  config: RuntimeConfig;
  tools: ToolDefinition[];
  options: WebUIServerOptions;
  runner: WebRunner;
  staticDir: string;
  subscribers: Set<(event: StreamEvent) => void>;
}

export interface WebUIServer {
  url: string;
  close(): Promise<void>;
  raw: Server;
}

export async function startWebUIServer(
  config: RuntimeConfig,
  tools: ToolDefinition[],
  options: WebUIServerOptions,
): Promise<WebUIServer> {
  const ctx: ServerContext = {
    config,
    tools,
    options,
    runner: new WebRunner(),
    staticDir: resolveStaticDir(options.staticDir),
    subscribers: new Set(),
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res, ctx).catch((error: unknown) => {
      sendJson(res, 500, { error: errorMessage(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const host = options.host === '0.0.0.0' ? 'localhost' : options.host;
  const url = `http://${host}:${port}`;

  return {
    url,
    raw: server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const subscriber of ctx.subscribers) ctx.subscribers.delete(subscriber);
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: ServerContext): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/info' && method === 'GET') {
    return sendJson(res, 200, buildServerInfo(ctx));
  }
  if (pathname === '/api/sessions' && method === 'GET') {
    const sessions = await listSessions();
    return sendJson(res, 200, sessions.map(toSessionSummary));
  }
  if (pathname === '/api/sessions' && method === 'POST') {
    const body = await readJsonBody<{ title?: string; cwd?: string }>(req);
    const session = createSession(body.title?.trim() || 'New chat', body.cwd ?? ctx.options.cwd);
    await saveSession(session);
    return sendJson(res, 201, toSessionSummary(session));
  }
  const sessionMatch = /^\/api\/sessions\/([\w-]+)$/.exec(pathname);
  if (sessionMatch) {
    const id = sessionMatch[1] as string;
    if (method === 'GET') {
      try {
        const session = await readSession(id);
        return sendJson(res, 200, session);
      } catch {
        return sendJson(res, 404, { error: 'Session not found' });
      }
    }
    if (method === 'DELETE') {
      await deleteSession(id);
      return sendJson(res, 204, null);
    }
    if (method === 'PATCH') {
      const body = await readJsonBody<{ title?: string }>(req);
      try {
        const session = await readSession(id);
        const updated = { ...session, title: body.title?.trim() || session.title };
        await saveSession(updated);
        return sendJson(res, 200, toSessionSummary(updated));
      } catch {
        return sendJson(res, 404, { error: 'Session not found' });
      }
    }
  }
  const runMatch = /^\/api\/sessions\/([\w-]+)\/run$/.exec(pathname);
  if (runMatch && method === 'POST') {
    const sessionId = runMatch[1] as string;
    const body = await readJsonBody<{ message: string; mode?: string; sandbox?: string; autoApprove?: boolean }>(req);
    if (!body.message || typeof body.message !== 'string') {
      return sendJson(res, 400, { error: 'Missing message' });
    }
    const agentOptions = buildAgentOptions(ctx, body);
    const runId = await ctx.runner.start({
      sessionId,
      message: body.message,
      config: ctx.config,
      tools: ctx.tools,
      options: agentOptions,
      emit: (event) => broadcast(ctx, event),
    });
    return sendJson(res, 202, { runId });
  }
  const cancelMatch = /^\/api\/runs\/([\w-]+)\/cancel$/.exec(pathname);
  if (cancelMatch && method === 'POST') {
    const ok = ctx.runner.cancel(cancelMatch[1] as string);
    return sendJson(res, ok ? 200 : 404, { ok });
  }
  const approvalMatch = /^\/api\/runs\/([\w-]+)\/approval$/.exec(pathname);
  if (approvalMatch && method === 'POST') {
    const body = await readJsonBody<{ approvalId: string; decision: ToolApprovalDecision }>(req);
    if (!body.approvalId || !isApprovalDecision(body.decision)) {
      return sendJson(res, 400, { error: 'Invalid approval' });
    }
    const ok = ctx.runner.approve(approvalMatch[1] as string, body.approvalId, body.decision);
    return sendJson(res, ok ? 200 : 404, { ok });
  }
  if (pathname === '/api/events' && method === 'GET') {
    return handleEventStream(res, ctx);
  }
  if (method === 'GET') {
    return serveStatic(req, res, ctx, pathname);
  }
  sendJson(res, 405, { error: 'Method not allowed' });
}

function buildServerInfo(ctx: ServerContext): ServerInfo {
  const sandbox = ctx.options.sandbox ?? defaultSandboxForMode(ctx.options.mode);
  return {
    version: '0.1.0',
    cwd: ctx.options.cwd,
    model: ctx.config.model,
    baseUrl: ctx.config.baseUrl,
    mode: ctx.options.mode,
    sandbox,
    dryRun: ctx.options.dryRun,
    autoApprove: ctx.options.autoApprove,
    maxIterations: ctx.options.maxIterations,
    models: [...SUPPORTED_MODELS],
    modes: ['plan', 'agent', 'yolo'],
    sandboxLevels: ['read-only', 'workspace-write', 'danger-full-access'],
    toolNames: ctx.tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b)),
    apiKeyConfigured: Boolean(ctx.config.apiKey),
    workspaceWritable: sandbox !== 'read-only',
  };
}

function buildAgentOptions(ctx: ServerContext, body: { mode?: string; sandbox?: string; autoApprove?: boolean }): AgentOptions {
  const mode = isMode(body.mode) ? body.mode : ctx.options.mode;
  const sandbox = isSandbox(body.sandbox) ? body.sandbox : ctx.options.sandbox;
  return {
    cwd: ctx.options.cwd,
    dryRun: ctx.options.dryRun,
    autoApprove: body.autoApprove ?? ctx.options.autoApprove ?? mode === 'yolo',
    maxIterations: ctx.options.maxIterations,
    mode,
    ...(sandbox ? { sandbox } : {}),
  };
}

function broadcast(ctx: ServerContext, event: StreamEvent): void {
  for (const subscriber of ctx.subscribers) {
    subscriber(event);
  }
}

function handleEventStream(res: ServerResponse, ctx: ServerContext): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  const subscriber = (event: StreamEvent): void => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  ctx.subscribers.add(subscriber);
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);
  res.on('close', () => {
    clearInterval(heartbeat);
    ctx.subscribers.delete(subscriber);
  });
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, ctx: ServerContext, pathname: string): Promise<void> {
  const safe = pathname === '/' ? '/index.html' : pathname;
  const target = path.normalize(path.join(ctx.staticDir, safe));
  if (!target.startsWith(ctx.staticDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  let stat;
  try {
    stat = statSync(target);
  } catch {
    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    // SPA fallback: serve index.html for unknown paths.
    return sendIndex(res, ctx);
  }
  if (stat.isDirectory()) {
    return sendIndex(res, ctx);
  }
  res.writeHead(200, {
    'Content-Type': mimeFor(target),
    'Cache-Control': 'no-store',
    'Content-Length': String(stat.size),
  });
  createReadStream(target).pipe(res);
}

async function sendIndex(res: ServerResponse, ctx: ServerContext): Promise<void> {
  const indexPath = path.join(ctx.staticDir, 'index.html');
  try {
    const html = await readFile(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch (error) {
    sendJson(res, 500, { error: `Web UI assets not found: ${errorMessage(error)}` });
  }
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    if (Buffer.concat(chunks).length > 5 * 1024 * 1024) {
      throw new Error('Request body too large');
    }
  }
  if (chunks.length === 0) return {} as T;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim().length === 0) return {} as T;
  return JSON.parse(raw) as T;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

function toSessionSummary(session: SessionRecord): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

function isMode(value: unknown): value is 'plan' | 'agent' | 'yolo' {
  return value === 'plan' || value === 'agent' || value === 'yolo';
}

function isSandbox(value: unknown): value is 'read-only' | 'workspace-write' | 'danger-full-access' {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}

function isApprovalDecision(value: unknown): value is ToolApprovalDecision {
  return value === 'approve' || value === 'deny' || value === 'always';
}
