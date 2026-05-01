import type { ToolDefinition } from '../types.js';
import { fileTools } from './files.js';
import { searchTool } from './search.js';
import { shellTool } from './shell.js';

export const defaultTools: ToolDefinition[] = [...fileTools, searchTool, shellTool];
