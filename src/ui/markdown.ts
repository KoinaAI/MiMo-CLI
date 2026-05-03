import chalk from 'chalk';
import { highlightCode } from './syntax.js';

/**
 * Lightweight terminal Markdown renderer.
 *
 * Handles: headers, bold, italic, inline code, code blocks (with optional
 * syntax highlighting), bullet/numbered lists, horizontal rules, links, and
 * blockquotes. Aimed at producing Codex/Claude-Code-style output without
 * pulling in a heavy markdown engine.
 */
const DEFAULT_TABLE_WIDTH = 96;

export function renderMarkdown(text: string, options: { width?: number } = {}): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  const codeLines: string[] = [];
  const tableWidth = options.width ?? DEFAULT_TABLE_WIDTH;

  const flushCodeBlock = (): void => {
    const lang = codeLang || 'code';
    output.push(chalk.dim(`  ┌── ${lang} ${'─'.repeat(Math.max(2, 32 - lang.length))}`));
    const highlighted = codeLang ? highlightCode(codeLines.join('\n'), codeLang) : codeLines.join('\n');
    for (const codeLine of highlighted.split('\n')) {
      output.push(chalk.dim('  │ ') + codeLine);
    }
    output.push(chalk.dim('  └' + '─'.repeat(36)));
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        codeLines.length = 0;
        continue;
      }
      flushCodeBlock();
      inCodeBlock = false;
      codeLang = '';
      codeLines.length = 0;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const nextLine = lines[lineIndex + 1] ?? '';
    if (isTableRow(line) && isTableSeparator(nextLine)) {
      const tableLines = [line, nextLine];
      lineIndex += 2;
      while (lineIndex < lines.length && isTableRow(lines[lineIndex] ?? '')) {
        tableLines.push(lines[lineIndex] ?? '');
        lineIndex += 1;
      }
      lineIndex -= 1;
      output.push(...renderTable(tableLines, tableWidth));
      continue;
    }

    // Headers
    const h1Match = line.match(/^# (.+)/);
    if (h1Match) { output.push(chalk.bold.cyan(`  ${h1Match[1]}`)); continue; }

    const h2Match = line.match(/^## (.+)/);
    if (h2Match) { output.push(chalk.bold.blue(`  ${h2Match[1]}`)); continue; }

    const h3Match = line.match(/^### (.+)/);
    if (h3Match) { output.push(chalk.bold(`  ${h3Match[1]}`)); continue; }

    const h4Match = line.match(/^####+ (.+)/);
    if (h4Match) { output.push(chalk.bold.dim(`  ${h4Match[1]}`)); continue; }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      output.push(chalk.dim('  ' + '─'.repeat(36)));
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      const quoted = line.replace(/^>\s?/, '');
      output.push(chalk.gray('  ▎ ') + chalk.italic(renderInline(quoted)));
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[*\-+] (.+)/);
    if (bulletMatch) {
      const indent = '  ' + (bulletMatch[1] ?? '');
      output.push(`${indent}${chalk.cyan('•')} ${renderInline(bulletMatch[2] ?? '')}`);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)\d+\.\s(.+)/);
    if (numMatch) {
      const indent = '  ' + (numMatch[1] ?? '');
      const numText = line.match(/^\s*(\d+)\./);
      const num = numText ? numText[1] : '1';
      output.push(`${indent}${chalk.cyan(`${num}.`)} ${renderInline(numMatch[2] ?? '')}`);
      continue;
    }

    if (line.trim() === '') {
      output.push('');
      continue;
    }

    output.push(`  ${renderInline(line)}`);
  }

  // Handle unclosed code blocks gracefully
  if (inCodeBlock && codeLines.length > 0) {
    flushCodeBlock();
  }

  return output.join('\n');
}

function renderInline(text: string): string {
  let result = text;

  // Inline code first to protect from other markup
  result = result.replace(/`([^`]+)`/g, (_, code: string) => chalk.cyan(`\`${code}\``));

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, (_, t: string) => chalk.bold.italic(t));

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t: string) => chalk.bold(t));
  result = result.replace(/__(.+?)__/g, (_, t: string) => chalk.bold(t));

  // Italic
  result = result.replace(/\*(.+?)\*/g, (_, t: string) => chalk.italic(t));
  result = result.replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, (_, lead: string, t: string) => `${lead}${chalk.italic(t)}`);

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, (_, t: string) => chalk.strikethrough(t));

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText: string, url: string) => {
    return `${chalk.blue.underline(linkText)} ${chalk.dim(`(${url})`)}`;
  });

  return result;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length >= 2;
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const content = trimmed.startsWith('|') && trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed;
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  let inCode = false;
  for (const char of content) {
    if (escaped) {
      cell += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      cell += char;
      continue;
    }
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) {
      cells.push(cell.trim().replace(/\\\|/g, '|'));
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim().replace(/\\\|/g, '|'));
  return cells;
}

function renderTable(lines: string[], maxWidth: number): string[] {
  if (lines.length < 2) return lines.map((line) => `  ${renderInline(line)}`);
  const header = splitTableRow(lines[0] ?? '');
  const rows = lines.slice(2).map(splitTableRow);
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length));
  const available = Math.max(columnCount * 4, maxWidth - 4 - (columnCount + 1));
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const values = [header[index] ?? '', ...rows.map((row) => row[index] ?? '')];
    const natural = Math.max(3, ...values.map((value) => visibleLength(value)));
    return Math.min(32, natural);
  });
  shrinkWidths(widths, available);
  const separator = `  ${chalk.dim('┌')}${widths.map((width) => chalk.dim('─'.repeat(width + 2))).join(chalk.dim('┬'))}${chalk.dim('┐')}`;
  const divider = `  ${chalk.dim('├')}${widths.map((width) => chalk.dim('─'.repeat(width + 2))).join(chalk.dim('┼'))}${chalk.dim('┤')}`;
  const bottom = `  ${chalk.dim('└')}${widths.map((width) => chalk.dim('─'.repeat(width + 2))).join(chalk.dim('┴'))}${chalk.dim('┘')}`;
  return [
    separator,
    renderTableRow(header, widths, true),
    divider,
    ...rows.map((row) => renderTableRow(row, widths, false)),
    bottom,
  ];
}

function shrinkWidths(widths: number[], available: number): void {
  while (widths.reduce((sum, width) => sum + width, 0) > available) {
    let largestIndex = 0;
    for (let index = 1; index < widths.length; index += 1) {
      if ((widths[index] ?? 0) > (widths[largestIndex] ?? 0)) largestIndex = index;
    }
    if ((widths[largestIndex] ?? 0) <= 6) break;
    widths[largestIndex] = (widths[largestIndex] ?? 6) - 1;
  }
}

function renderTableRow(row: string[], widths: number[], header: boolean): string {
  const cells = widths.map((width, index) => {
    const value = truncateCell(row[index] ?? '', width);
    const padded = value.padEnd(width);
    return ` ${header ? chalk.bold(renderInline(padded)) : renderInline(padded)} `;
  });
  return `  ${chalk.dim('│')}${cells.join(chalk.dim('│'))}${chalk.dim('│')}`;
}

function truncateCell(value: string, width: number): string {
  if (visibleLength(value) <= width) return value;
  return `${Array.from(value).slice(0, Math.max(0, width - 1)).join('')}…`;
}

function visibleLength(value: string): number {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '').length;
}
