import { BlockquoteBlock } from './BlockquoteBlock.jsx';
import { runToHTML, runToPlainText } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

function toHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  return `<p>${runs.map((r) => runToHTML(r, ctx)).join('')}</p>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
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
  fromHTML,
  slashCommand: {
    label: 'Quote',
    keywords: ['quote', 'blockquote', 'citation'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('blockquote')),
  },
};
