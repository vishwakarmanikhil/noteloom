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

export function runToPlainText(run, ctx) {
  if (!run) return '';
  if (run.type !== 'text') {
    const entry = ctx?.inlineRegistry?.get(run.type);
    return entry ? entry.toPlainText(run, ctx) : (run.value ?? '');
  }
  return run.value ?? '';
}
