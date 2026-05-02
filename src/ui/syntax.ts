import chalk from 'chalk';

/**
 * Lightweight terminal syntax highlighter.
 *
 * This is intentionally regex-based and not a full lexer. The goal is to
 * give code blocks in the TUI the *feel* of Codex/Claude-style highlighting
 * (keywords, strings, comments, numbers tinted) without pulling in a heavy
 * tokenizer. Falls back to plain text for unknown languages.
 */

interface LanguageRules {
  comment?: RegExp;
  blockComment?: { start: RegExp; end: RegExp };
  strings: RegExp[];
  keywords: Set<string>;
  numbers: RegExp;
}

const COMMON_NUMBERS = /\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;

const TS_JS_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'debugger', 'declare', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get',
  'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'is', 'let',
  'namespace', 'new', 'null', 'of', 'private', 'protected', 'public', 'readonly',
  'return', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
]);

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def',
  'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
]);

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
  'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
  'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static',
  'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
]);

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map',
  'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var',
  'true', 'false', 'nil',
]);

const SHELL_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until',
  'case', 'esac', 'function', 'return', 'export', 'local', 'readonly', 'declare',
  'set', 'unset', 'shift', 'source',
]);

const LANG_RULES: Record<string, LanguageRules> = {
  typescript: {
    comment: /\/\/.*$/,
    blockComment: { start: /\/\*/, end: /\*\// },
    strings: [/"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g, /`(?:[^`\\]|\\.)*`/g],
    keywords: TS_JS_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  javascript: {
    comment: /\/\/.*$/,
    blockComment: { start: /\/\*/, end: /\*\// },
    strings: [/"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g, /`(?:[^`\\]|\\.)*`/g],
    keywords: TS_JS_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  python: {
    comment: /#.*$/,
    strings: [/"""[\s\S]*?"""/g, /'''[\s\S]*?'''/g, /"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g],
    keywords: PYTHON_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  rust: {
    comment: /\/\/.*$/,
    blockComment: { start: /\/\*/, end: /\*\// },
    strings: [/"(?:[^"\\]|\\.)*"/g, /b"(?:[^"\\]|\\.)*"/g],
    keywords: RUST_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  go: {
    comment: /\/\/.*$/,
    blockComment: { start: /\/\*/, end: /\*\// },
    strings: [/"(?:[^"\\]|\\.)*"/g, /`[^`]*`/g],
    keywords: GO_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  shell: {
    comment: /#.*$/,
    strings: [/"(?:[^"\\]|\\.)*"/g, /'[^']*'/g],
    keywords: SHELL_KEYWORDS,
    numbers: COMMON_NUMBERS,
  },
  json: {
    strings: [/"(?:[^"\\]|\\.)*"/g],
    keywords: new Set(['true', 'false', 'null']),
    numbers: COMMON_NUMBERS,
  },
  yaml: {
    comment: /#.*$/,
    strings: [/"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g],
    keywords: new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off']),
    numbers: COMMON_NUMBERS,
  },
};

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  bash: 'shell',
  sh: 'shell',
  zsh: 'shell',
  yml: 'yaml',
};

export function highlightCode(code: string, lang: string): string {
  const normalized = LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  const rules = LANG_RULES[normalized];
  if (!rules) return code;

  const lines = code.split('\n');
  let inBlockComment = false;
  return lines.map((line) => highlightLine(line, rules, inBlockComment, (next) => { inBlockComment = next; })).join('\n');
}

function highlightLine(line: string, rules: LanguageRules, blockState: boolean, setBlock: (next: boolean) => void): string {
  // Handle multi-line block comments first
  let working = line;
  let prefix = '';
  if (blockState && rules.blockComment) {
    const endIndex = working.search(rules.blockComment.end);
    if (endIndex >= 0) {
      const commentEnd = endIndex + 2;
      prefix = chalk.gray.italic(working.slice(0, commentEnd));
      working = working.slice(commentEnd);
      setBlock(false);
    } else {
      return chalk.gray.italic(working);
    }
  }

  // Mask out strings + comments to avoid keyword matches inside them
  const masks: { start: number; end: number; render: string }[] = [];

  if (rules.blockComment) {
    let cursor = 0;
    while (cursor < working.length) {
      const startMatch = working.slice(cursor).match(rules.blockComment.start);
      if (!startMatch || startMatch.index === undefined) break;
      const start = cursor + startMatch.index;
      const after = start + startMatch[0].length;
      const endMatch = working.slice(after).match(rules.blockComment.end);
      if (endMatch && endMatch.index !== undefined) {
        const end = after + endMatch.index + endMatch[0].length;
        masks.push({ start, end, render: chalk.gray.italic(working.slice(start, end)) });
        cursor = end;
      } else {
        masks.push({ start, end: working.length, render: chalk.gray.italic(working.slice(start)) });
        setBlock(true);
        cursor = working.length;
      }
    }
  }

  for (const stringRe of rules.strings) {
    const re = new RegExp(stringRe.source, stringRe.flags.includes('g') ? stringRe.flags : `${stringRe.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(working)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (overlapsAny(masks, start, end)) continue;
      masks.push({ start, end, render: chalk.green(match[0]) });
    }
  }

  if (rules.comment) {
    const match = working.match(rules.comment);
    if (match && match.index !== undefined) {
      const start = match.index;
      const end = start + match[0].length;
      if (!overlapsAny(masks, start, end)) {
        masks.push({ start, end, render: chalk.gray.italic(match[0]) });
      }
    }
  }

  // Numbers and identifiers (only outside masks)
  masks.sort((a, b) => a.start - b.start);
  const out: string[] = [];
  let cursor = 0;
  for (const mask of masks) {
    if (cursor < mask.start) {
      out.push(highlightOpen(working.slice(cursor, mask.start), rules));
    }
    out.push(mask.render);
    cursor = mask.end;
  }
  if (cursor < working.length) {
    out.push(highlightOpen(working.slice(cursor), rules));
  }
  return prefix + out.join('');
}

function highlightOpen(text: string, rules: LanguageRules): string {
  // Numbers
  let result = text.replace(rules.numbers, (m) => chalk.yellow(m));
  // Keywords (whole words)
  result = result.replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g, (word) => {
    if (rules.keywords.has(word)) return chalk.magentaBright(word);
    return word;
  });
  return result;
}

function overlapsAny(masks: { start: number; end: number }[], start: number, end: number): boolean {
  return masks.some((mask) => start < mask.end && end > mask.start);
}
