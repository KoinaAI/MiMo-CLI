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
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  const codeLines: string[] = [];

  const flushCodeBlock = (): void => {
    const lang = codeLang || 'code';
    output.push(chalk.dim(`  ┌── ${lang} ${'─'.repeat(Math.max(2, 32 - lang.length))}`));
    const highlighted = codeLang ? highlightCode(codeLines.join('\n'), codeLang) : codeLines.join('\n');
    for (const codeLine of highlighted.split('\n')) {
      output.push(chalk.dim('  │ ') + codeLine);
    }
    output.push(chalk.dim('  └' + '─'.repeat(36)));
  };

  for (const line of lines) {
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
