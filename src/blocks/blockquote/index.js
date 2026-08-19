import { BlockquoteBlock } from './BlockquoteBlock.jsx';
import { runToHTML, runToPlainText, runsToMarkdown } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { QuoteIcon } from '../../react/icons.jsx';

function toHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  return `<p>${runs.map((r) => runToHTML(r, ctx)).join('')}</p>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

// Consecutive blockquote sibling blocks (one per line, this editor's own
// model — see clipboard/serialize.js's toHTML grouping) each get their own
// leading "> " here; the top-level exportDocumentMarkdown joiner knows not
// to insert a blank line between consecutive blockquote siblings, so they
// read back as one continuous quote instead of separate ones.
function toMarkdown(block, ctx) {
  const text = runsToMarkdown(block.contentIds.map((runId) => ctx.store.getRun(runId)), ctx);
  return `> ${text}`;
}

function fromHTML(node, ctx) {
  if (node.tagName !== 'BLOCKQUOTE') return null;
  const runs = domInlineToRuns(node, ctx);
  const block = { id: genId(), type: 'blockquote', parentId: null, contentIds: runs.map((r) => r.id), props: {} };
  return { block, runs };
}

export const blockquoteBlockType = {
  component: BlockquoteBlock,
  isLeaf: true,
  defaultProps: {},
  toHTML,
  toPlainText,
  toMarkdown,
  fromHTML,
  slashCommand: {
    label: 'Quote',
    icon: QuoteIcon,
    keywords: ['quote', 'blockquote', 'citation'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('blockquote')),
  },
};
