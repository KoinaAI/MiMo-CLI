import type { ToolDefinition } from '../types.js';
import { askUserTools } from './ask-user.js';
import { fileTools } from './files.js';
import { fileSearchTools } from './file-search.js';
import { gitTools } from './git.js';
import { globTools } from './glob.js';
import { patchTools } from './patch.js';
import { readManyTools } from './read-many.js';
import { searchTool } from './search.js';
import { shellTool } from './shell.js';
import { todoTools } from './todo.js';
import { webTools } from './web.js';
import { webSearchTools } from './web-search.js';

export const defaultTools: ToolDefinition[] = [
  ...fileTools,
  ...fileSearchTools,
  ...gitTools,
  ...globTools,
  ...patchTools,
  ...readManyTools,
  searchTool,
  shellTool,
  ...todoTools,
  ...webTools,
  ...webSearchTools,
  ...askUserTools,
];
