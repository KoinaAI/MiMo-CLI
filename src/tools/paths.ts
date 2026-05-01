import path from 'node:path';
import { MiMoCliError } from '../utils/errors.js';

export function resolveWorkspacePath(cwd: string, requestedPath: string): string {
  const resolved = path.resolve(cwd, requestedPath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new MiMoCliError(`Path escapes workspace: ${requestedPath}`);
  }
  return resolved;
}
