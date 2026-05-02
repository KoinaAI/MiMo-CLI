import chalk from 'chalk';

/**
 * Lightweight terminal Markdown renderer.
 * Handles: headers, bold, italic, inline code, code blocks,
 * bullet/numbered lists, horizontal rules, links, and blockquotes.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  const codeLines: string[] = [];

  for (const line of lines) {
    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        codeLines.length = 0;
        continue;
      } else {
        inCodeBlock = false;
        const header = codeLang ? chalk.dim(`  ─── ${codeLang} ───`) : chalk.dim('  ─── code ───');
        output.push(header);
        for (const codeLine of codeLines) {
          output.push(chalk.gray(`  │ `) + chalk.white(codeLine));
        }
        output.push(chalk.dim('  ───────────'));
        codeLang = '';
        continue;
      }
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
      output.push(chalk.dim('  ────────────────────────'));
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      const quoted = line.replace(/^>\s?/, '');
      output.push(chalk.gray('  │ ') + chalk.italic(renderInline(quoted)));
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[*\-+] (.+)/);
    if (bulletMatch) {
      const indent = '  ' + bulletMatch[1];
      output.push(`${indent}${chalk.dim('•')} ${renderInline(bulletMatch[2] ?? '')}`);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)\d+\.\s(.+)/);
    if (numMatch) {
      const indent = '  ' + numMatch[1];
      const numText = line.match(/^\s*(\d+)\./);
      const num = numText ? numText[1] : '1';
      output.push(`${indent}${chalk.dim(`${num}.`)} ${renderInline(numMatch[2] ?? '')}`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      output.push('');
      continue;
    }

    // Regular text with inline formatting
    output.push(`  ${renderInline(line)}`);
  }

  // Handle unclosed code blocks
  if (inCodeBlock && codeLines.length > 0) {
    output.push(chalk.dim(`  ─── ${codeLang || 'code'} ───`));
    for (const codeLine of codeLines) {
      output.push(chalk.gray(`  │ `) + chalk.white(codeLine));
    }
    output.push(chalk.dim('  ───────────'));
  }

  return output.join('\n');
}

/**
 * Render inline Markdown formatting: bold, italic, code, links, strikethrough.
 */
function renderInline(text: string): string {
  let result = text;

  // Inline code (must be before bold/italic to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, (_, code: string) => chalk.bgGray.white(` ${code} `));

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, (_, t: string) => chalk.bold.italic(t));

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t: string) => chalk.bold(t));
  result = result.replace(/__(.+?)__/g, (_, t: string) => chalk.bold(t));

  // Italic
  result = result.replace(/\*(.+?)\*/g, (_, t: string) => chalk.italic(t));
  result = result.replace(/_(.+?)_/g, (_, t: string) => chalk.italic(t));

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, (_, t: string) => chalk.strikethrough(t));

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText: string, url: string) => {
    return `${chalk.blue.underline(linkText)} ${chalk.dim(`(${url})`)}`;
  });

  return result;
}
