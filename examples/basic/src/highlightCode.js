/**
 * A tiny, dependency-free demo tokenizer for NoteloomEditor's `highlightCode`
 * prop (see useHighlightCode's doc comment in the package itself) — proves
 * out the extension point without pulling in a real highlighter library
 * (Prism, Shiki, highlight.js, ...) as a dependency of this example. A real
 * app should swap this for one of those; this one only recognizes a handful
 * of token classes (strings, comments, numbers, a fixed keyword list) and
 * knows nothing about most languages' actual grammar.
 */

const KEYWORDS_BY_LANGUAGE = {
  javascript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'extends',
    'import',
    'export',
    'from',
    'default',
    'new',
    'this',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'typeof',
    'instanceof',
    'null',
    'undefined',
    'true',
    'false',
  ],
  python: [
    'def',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'class',
    'import',
    'from',
    'as',
    'with',
    'try',
    'except',
    'finally',
    'raise',
    'lambda',
    'None',
    'True',
    'False',
    'and',
    'or',
    'not',
    'in',
    'is',
    'self',
  ],
  html: ['DOCTYPE'],
  css: [],
  sql: [
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'JOIN',
    'ON',
    'GROUP',
    'BY',
    'ORDER',
    'AND',
    'OR',
    'NOT',
    'NULL',
  ],
  bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'echo', 'export'],
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Order matters: comments/strings are matched before keywords/numbers so a
// keyword-looking substring inside a string ("const" in "the const is...")
// never gets tokenized as one.
const TOKEN_PATTERN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)/g;

export function highlightCode(code, language) {
  const keywords = new Set(KEYWORDS_BY_LANGUAGE[language] ?? []);
  let html = '';
  let lastIndex = 0;

  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const [full, comment, string] = match;
    html += tokenizeKeywords(code.slice(lastIndex, match.index), keywords);
    const className = comment ? 'tok-comment' : string ? 'tok-string' : 'tok-number';
    html += `<span class="${className}">${escapeHtml(full)}</span>`;
    lastIndex = match.index + full.length;
  }
  html += tokenizeKeywords(code.slice(lastIndex), keywords);
  return html;
}

function tokenizeKeywords(text, keywords) {
  if (keywords.size === 0) return escapeHtml(text);
  return text
    .split(/(\b[A-Za-z_]\w*\b)/)
    .map((chunk) =>
      keywords.has(chunk) ? `<span class="tok-keyword">${chunk}</span>` : escapeHtml(chunk),
    )
    .join('');
}
