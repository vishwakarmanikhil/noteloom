/**
 * Serialization for a single inline Run. Shared by every leaf block type
 * (paragraph, heading, list item title, table cell) so formatting logic is
 * written exactly once instead of once per block type.
 *
 * `ctx.inlineRegistry` is optional — callers that don't mix in any
 * non-text inline types (or are serializing a run known to be plain text)
 * can omit it; a non-text run with no registry available just falls back
 * to its raw `value` rather than throwing.
 */

export function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, '&quot;');
}

export function runToHTML(run, ctx) {
  if (!run) return '';

  if (run.type !== 'text') {
    const entry = ctx?.inlineRegistry?.get(run.type);
    return entry ? entry.toHTML(run, ctx) : escapeHTML(run.value ?? '');
  }

  const marks = run.marks ?? {};
  let html = escapeHTML(run.value ?? '');
  if (marks.code) html = `<code>${html}</code>`;
  if (marks.bold) html = `<strong>${html}</strong>`;
  if (marks.italic) html = `<em>${html}</em>`;
  if (marks.underline) html = `<u>${html}</u>`;
  if (marks.strike) html = `<s>${html}</s>`;
  if (marks.subscript) html = `<sub>${html}</sub>`;
  if (marks.superscript) html = `<sup>${html}</sup>`;
  if (marks.color) html = `<span style="color:${escapeAttr(marks.color)}">${html}</span>`;
  if (marks.highlight) html = `<span style="background-color:${escapeAttr(marks.highlight)}">${html}</span>`;
  if (marks.link?.href) {
    const targetAttrs = marks.link.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : '';
    html = `<a href="${escapeAttr(marks.link.href)}"${targetAttrs}>${html}</a>`;
  }
  return html;
}

/** Serializes a whole ordered run list to one HTML string — every leaf block's own toHTML already inlines exactly this. */
export function runsToHTML(runs, ctx) {
  return (runs ?? []).map((run) => runToHTML(run, ctx)).join('');
}

export function runToPlainText(run, ctx) {
  if (!run) return '';
  if (run.type !== 'text') {
    const entry = ctx?.inlineRegistry?.get(run.type);
    return entry ? entry.toPlainText(run, ctx) : (run.value ?? '');
  }
  return run.value ?? '';
}

/**
 * Escapes characters that CommonMark would otherwise interpret as syntax
 * inside plain run text — backslash, backtick, `*`, `_`, `[`, `]` (the ones
 * that actually trigger unwanted emphasis/code/link parsing mid-sentence).
 * Deliberately NOT exhaustive (leaves `#`, `-`, `.`, `!`, `>` alone) — those
 * only matter at the START of a line, a block-level concern the per-block
 * `toMarkdown` functions own, not this run-level escaper; escaping them
 * unconditionally everywhere would turn ordinary sentences into a mess of
 * backslashes for no benefit.
 */
export function escapeMarkdown(str) {
  return (str ?? '').replace(/[\\`*_[\]]/g, (c) => `\\${c}`);
}

/**
 * Markdown counterpart to `runToHTML` — same shared-across-every-leaf-block
 * design. A non-text run (select/date/mention/checkbox chip, ...) falls
 * back to its own `toPlainText` (no per-inline-type `toMarkdown` exists;
 * chips don't have a meaningful alternate Markdown form worth a whole
 * separate code path per inline type). Marks with no native Markdown
 * syntax (underline, sub/superscript, color, highlight) fall back to
 * inline HTML tags, which CommonMark passes through — most Markdown
 * renderers (GitHub included) render them correctly.
 */
export function runToMarkdown(run, ctx) {
  if (!run) return '';
  if (run.type !== 'text') {
    const entry = ctx?.inlineRegistry?.get(run.type);
    return entry ? entry.toPlainText(run, ctx) : (run.value ?? '');
  }

  const marks = run.marks ?? {};
  const raw = run.value ?? '';
  let md = marks.code ? raw : escapeMarkdown(raw); // code span content is literal, never escaped
  if (marks.code) md = `\`${md}\``;
  if (marks.bold) md = `**${md}**`;
  if (marks.italic) md = `*${md}*`;
  if (marks.strike) md = `~~${md}~~`;
  if (marks.underline) md = `<u>${md}</u>`;
  if (marks.subscript) md = `<sub>${md}</sub>`;
  if (marks.superscript) md = `<sup>${md}</sup>`;
  if (marks.color) md = `<span style="color:${escapeAttr(marks.color)}">${md}</span>`;
  if (marks.highlight) md = `<span style="background-color:${escapeAttr(marks.highlight)}">${md}</span>`;
  if (marks.link?.href) md = `[${md}](${marks.link.href})`;
  return md;
}

/** Serializes a whole ordered run list to one Markdown string — every leaf block's own toMarkdown inlines exactly this. */
export function runsToMarkdown(runs, ctx) {
  return (runs ?? []).map((run) => runToMarkdown(run, ctx)).join('');
}
