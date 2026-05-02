import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';

const MAX_BODY = 30_000;
const DEFAULT_TIMEOUT = 15_000;

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch the text content of a URL. Useful for reading documentation, APIs, or web pages.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch.' },
      maxLength: { type: 'number', description: 'Maximum response body length. Default 30000.' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async run(input, context) {
    const url = asString(input.url, 'url');
    const maxLength = optionalNumber(input.maxLength, 'maxLength') ?? MAX_BODY;
    if (context.dryRun) {
      return `[dry-run] Would fetch: ${url}`;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'MiMo-Code-CLI/0.1.0' },
      });
      clearTimeout(timer);
      const text = await response.text();
      const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}\n[truncated at ${maxLength} chars]` : text;
      return `Status: ${response.status}\n\n${truncated}`;
    } catch (error) {
      return `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

export const webTools: ToolDefinition[] = [webFetchTool];
