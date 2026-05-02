import type { ToolDefinition } from '../types.js';
import { fileTools } from './files.js';
import { fileSearchTools } from './file-search.js';
import { gitTools } from './git.js';
import { patchTools } from './patch.js';
import { searchTool } from './search.js';
import { shellTool } from './shell.js';
import { todoTools } from './todo.js';
import { webTools } from './web.js';

export const defaultTools: ToolDefinition[] = [
  ...fileTools,
  ...fileSearchTools,
  ...gitTools,
  ...patchTools,
  searchTool,
  shellTool,
  ...todoTools,
  ...webTools,
];
