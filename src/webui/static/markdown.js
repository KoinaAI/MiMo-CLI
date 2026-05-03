// Tiny markdown renderer optimized for chat messages.
// Supports: code fences, inline code, headings, lists, blockquotes,
// bold/italic, links. Output is HTML-escaped before formatting tokens are
// applied, so user-supplied text cannot inject HTML.

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input) {
  return String(input ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function renderInline(text) {
  return text
    .replace(/`([^`]+?)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderCodeBlock(language, content) {
  const langClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  return `<pre><code${langClass}>${escapeHtml(content)}</code></pre>`;
}

export function renderMarkdown(input) {
  if (input === null || input === undefined) return "";
  const lines = String(input).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  let fenceLang = "";
  let fenceLines = [];
  let listType = null; // "ul" | "ol" | null
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const ensureList = (type) => {
    if (listType !== type) {
      flushList();
      listType = type;
      out.push(`<${type}>`);
    }
  };

  for (let raw of lines) {
    const fenceMatch = /^```(\w+)?\s*$/.exec(raw);
    if (fenceMatch && !inFence) {
      flushList();
      inFence = true;
      fenceLang = fenceMatch[1] || "";
      fenceLines = [];
      continue;
    }
    if (inFence) {
      if (/^```\s*$/.test(raw)) {
        out.push(renderCodeBlock(fenceLang, fenceLines.join("\n")));
        inFence = false;
        fenceLang = "";
        fenceLines = [];
      } else {
        fenceLines.push(raw);
      }
      continue;
    }
    if (raw.trim() === "") {
      flushList();
      out.push("");
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (heading) {
      flushList();
      const level = heading[1].length + 2; // start at h3 to keep visual scale
      const safe = escapeHtml(heading[2]);
      out.push(`<h${level}>${renderInline(safe)}</h${level}>`);
      continue;
    }
    const ulMatch = /^\s*[-*+]\s+(.*)$/.exec(raw);
    if (ulMatch) {
      ensureList("ul");
      out.push(`<li>${renderInline(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(raw);
    if (olMatch) {
      ensureList("ol");
      out.push(`<li>${renderInline(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }
    const quoteMatch = /^>\s?(.*)$/.exec(raw);
    if (quoteMatch) {
      flushList();
      out.push(`<blockquote>${renderInline(escapeHtml(quoteMatch[1]))}</blockquote>`);
      continue;
    }
    flushList();
    out.push(`<p>${renderInline(escapeHtml(raw))}</p>`);
  }
  if (inFence) {
    out.push(renderCodeBlock(fenceLang, fenceLines.join("\n")));
  }
  flushList();
  return out.join("\n");
}
