import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';

const MAX_RESULTS = 10;
const SEARCH_TIMEOUT = 15_000;
const MAX_PAGE_SIZE = 50_000;
const DUCKDUCKGO_URL = 'https://html.duckduckgo.com/html/';

/**
 * Parse DuckDuckGo HTML search results.
 * Extracts titles, URLs, and snippets from the HTML response.
 */
function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: { url: string; title: string }[] = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null && links.length < maxResults) {
    let url = match[1] ?? '';
    // DuckDuckGo wraps URLs in redirect links
    const uddgMatch = url.match(/uddg=([^&]+)/);
    if (uddgMatch) url = decodeURIComponent(uddgMatch[1] ?? '');
    const title = (match[2] ?? '').replace(/<[^>]+>/g, '').trim();
    if (url && title) links.push({ url, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push((match[1] ?? '').replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < links.length && i < maxResults; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns titles, URLs, and snippets for the top results.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      maxResults: { type: 'number', description: 'Max results to return. Defaults to 5.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async run(input) {
    const query = asString(input.query, 'query');
    const maxResults = optionalNumber(input.maxResults, 'maxResults') ?? 5;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

      const response = await fetch(DUCKDUCKGO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (compatible; MiMo-Code-CLI/1.0)',
        },
        body: `q=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        return `Search failed: HTTP ${response.status}`;
      }

      const html = await response.text();
      const truncated = html.slice(0, MAX_PAGE_SIZE);
      const results = parseDuckDuckGoResults(truncated, Math.min(maxResults, MAX_RESULTS));

      if (results.length === 0) {
        return `No results found for: ${query}`;
      }

      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join('\n\n');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Search error: ${msg}`;
    }
  },
};

export const webSearchTools: ToolDefinition[] = [webSearchTool];
