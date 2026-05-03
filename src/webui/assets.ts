import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Locate the directory containing the Web UI static assets.
 *
 * The assets live at `src/webui/static/**` in the source tree and are copied
 * to `dist/webui/static/**` during `npm run build` (see
 * `scripts/build-webui.mjs`). This helper finds the right directory whether
 * we are running from the compiled `dist` output or directly from `src` via
 * `tsx`.
 */
export function resolveStaticDir(override?: string | undefined): string {
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Compiled: dist/webui/assets.js -> dist/webui/static
  // Source:   src/webui/assets.ts  -> src/webui/static
  const candidates = [
    path.join(here, 'static'),
    path.join(here, '..', '..', 'src', 'webui', 'static'),
    path.join(here, '..', '..', 'dist', 'webui', 'static'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] as string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}
