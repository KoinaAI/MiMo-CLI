export const LARGE_PASTE_CHAR_THRESHOLD = 1_000;
export const LARGE_PASTE_LINE_THRESHOLD = 20;

export function isLargePaste(text: string): boolean {
  return text.length > LARGE_PASTE_CHAR_THRESHOLD || text.split('\n').length > LARGE_PASTE_LINE_THRESHOLD;
}

export function createPastePlaceholder(text: string, existing: ReadonlySet<string>): string {
  const count = [...text].length;
  const base = `[Pasted Content ${count} chars]`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`[Pasted Content ${count} chars #${suffix}]`)) suffix += 1;
  return `[Pasted Content ${count} chars #${suffix}]`;
}

export function expandPastePlaceholders(value: string, pastes: ReadonlyMap<string, string>): string {
  let expanded = value;
  for (const [placeholder, text] of pastes) {
    expanded = expanded.split(placeholder).join(text);
  }
  return expanded;
}
