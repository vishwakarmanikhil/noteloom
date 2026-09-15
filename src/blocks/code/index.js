import { CodeBlock } from './CodeBlock.jsx';
import { defineBlock } from '../../registry/define.js';
import { runToHTML, runToPlainText, escapeHTML } from '../../inline/marks.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { CodeIcon } from '../../react/icons.jsx';

// Real-world "copy code" HTML (VS Code, GitHub, most syntax-highlighted
// doc sites) very often represents each source line as its own block-level
// element (one <div> or <span class="line"> per line, sometimes a bare
// <br> between lines) rather than literal "\n" characters in the text --
// the *visual* line break comes from that element being block-level, not
// from any character in the markup at all. `Element.textContent` doesn't
// know any of that: it's a flat, recursive concatenation of every
// descendant text node with NO separator ever inserted at an element
// boundary, so reading a <pre> built that way straight off `.textContent`
// (the old behavior here) silently squished every line back into one.
const LINE_BREAK_TAGS = new Set(['DIV', 'P', 'LI', 'TR']);

/**
 * Walks `node`'s descendants and reconstructs the line structure a reader
 * actually sees: a literal "\n" for each `<br>`, and one after every
 * block-level line container (`LINE_BREAK_TAGS`) -- covering both the
 * "<br>-separated" and "one element per line" clipboard shapes in the same
 * pass. Inline elements (spans, syntax-highlighting wrappers, etc.) are
 * walked through transparently, contributing no separator of their own.
 * The one synthetic trailing "\n" a final line-container/`<br>` would add
 * is dropped, so a real trailing blank line in the source still round-trips
 * (only the artifact of "the last line is *also* a container" is removed).
 */
function extractCodeText(node) {
  const lines = [''];
  const walk = (n) => {
    for (const child of n.childNodes) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        lines[lines.length - 1] += child.textContent;
      } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
        if (child.tagName === 'BR') {
          lines.push('');
        } else if (LINE_BREAK_TAGS.has(child.tagName)) {
          walk(child);
          lines.push('');
        } else {
          walk(child);
        }
      }
    }
  };
  walk(node);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function toHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  const language = block.props?.language;
  const langAttr =
    language && language !== 'plaintext' ? ` data-language="${escapeHTML(language)}"` : '';
  return `<pre><code${langAttr}>${runs.map((r) => runToHTML(r, ctx)).join('')}</code></pre>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

// A fenced code block, not runToMarkdown-per-run — code content is
// rendered verbatim (marks inside a code block have no meaning here
// anyway; CodeBlock never applies bold/italic to its own runs), so this
// reads the raw run values directly rather than going through the
// inline-marks Markdown path plain text already avoids the same way.
function toMarkdown(block, ctx) {
  const language = block.props?.language;
  const fenceLang = language && language !== 'plaintext' ? language : '';
  const code = block.contentIds.map((runId) => ctx.store.getRun(runId)?.value ?? '').join('');
  return `\`\`\`${fenceLang}\n${code}\n\`\`\``;
}

function fromHTML(node, ctx) {
  if (node.tagName !== 'PRE') return null;
  const codeEl = node.querySelector('code') ?? node;
  const language = codeEl.getAttribute?.('data-language');
  const runId = genId();
  const block = {
    id: genId(),
    type: 'code',
    parentId: null,
    contentIds: [runId],
    props: language ? { language } : {},
  };
  return { block, runs: [{ id: runId, type: 'text', value: extractCodeText(codeEl), marks: {} }] };
}

export const codeBlockType = defineBlock({
  name: 'code',
  contentModel: 'runs',
  component: CodeBlock,
  defaultProps: { language: 'plaintext' },
  toHTML,
  toPlainText,
  toMarkdown,
  fromHTML,
  slashCommand: {
    label: 'Code',
    icon: CodeIcon,
    keywords: ['code', 'codeblock', 'snippet', 'pre'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('code')),
  },
});
