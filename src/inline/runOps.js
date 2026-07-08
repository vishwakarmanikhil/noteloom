import { genId } from '../utils/idGen.js';

const TAG_TO_MARK = {
  STRONG: 'bold',
  B: 'bold',
  EM: 'italic',
  I: 'italic',
  U: 'underline',
  S: 'strike',
  STRIKE: 'strike',
  DEL: 'strike',
  CODE: 'code',
  SUB: 'subscript',
  SUP: 'superscript',
};

/**
 * Walks a DOM node's inline children (text + <strong>/<em>/<a>/etc., plus
 * any registered non-text inline type like a select chip) and produces an
 * array of Run objects carrying the accumulated marks. Reused by every leaf
 * block type's fromHTML matcher so paste-formatting logic is written once,
 * not duplicated per block type.
 *
 * `ctx.inlineRegistry` is optional — omit it if the caller never mixes in
 * non-text inline types (matched elements just fall through to their own
 * text content instead).
 */
export function domInlineToRuns(node, ctx, activeMarks = {}) {
  const runs = [];

  const walk = (n, marks) => {
    if (n.nodeType === 3 /* TEXT_NODE */) {
      const value = n.textContent;
      if (value) runs.push({ id: genId(), type: 'text', value, marks: { ...marks } });
      return;
    }
    if (n.nodeType !== 1 /* ELEMENT_NODE */) return;

    if (ctx?.inlineRegistry) {
      for (const entry of ctx.inlineRegistry.listHtmlMatchers()) {
        const run = entry.fromHTML(n, ctx);
        if (run) {
          runs.push(run);
          return; // atomic: don't also walk its children as plain text
        }
      }
    }

    let nextMarks = marks;
    const markName = TAG_TO_MARK[n.tagName];
    if (markName) nextMarks = { ...nextMarks, [markName]: true };
    if (n.tagName === 'A' && n.getAttribute('href')) {
      nextMarks = { ...nextMarks, link: { href: n.getAttribute('href') } };
    }
    // Color/highlight round-trip via inline style (see marks.js's runToHTML)
    // rather than a fixed tag — style.color/backgroundColor are only ever
    // set by us in that exact shape, so reading them back is unambiguous
    // for our own copy/paste; arbitrary third-party HTML with these styles
    // picks up the same treatment, which is a reasonable default.
    if (n.style?.color) nextMarks = { ...nextMarks, color: n.style.color };
    if (n.style?.backgroundColor) nextMarks = { ...nextMarks, highlight: n.style.backgroundColor };

    for (const child of n.childNodes) walk(child, nextMarks);
  };

  walk(node, activeMarks);
  return runs.length ? runs : [{ id: genId(), type: 'text', value: '', marks: {} }];
}
