import { HeadingBlock } from './HeadingBlock.jsx';
import { runToHTML, runToPlainText } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { Heading1Icon, Heading2Icon, Heading3Icon } from '../../react/icons.jsx';

const HEADING_ICONS = { 1: Heading1Icon, 2: Heading2Icon, 3: Heading3Icon };

const TAG_TO_LEVEL = { H1: 1, H2: 2, H3: 3 };

function toHTML(block, ctx) {
  const level = block.props?.level ?? 3;
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  return `<h${level}>${runs.map((r) => runToHTML(r, ctx)).join('')}</h${level}>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

function fromHTML(node, ctx) {
  const level = TAG_TO_LEVEL[node.tagName];
  if (!level) return null;
  const runs = domInlineToRuns(node, ctx);
  const block = {
    id: genId(),
    type: 'heading',
    parentId: null,
    contentIds: runs.map((r) => r.id),
    props: { level },
  };
  return { block, runs };
}

export const headingBlockType = {
  component: HeadingBlock,
  isLeaf: true,
  defaultProps: { level: 3 },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommands: [
    {
      label: 'Heading 1',
      icon: HEADING_ICONS[1],
      keywords: ['heading', 'h1', 'title'],
      run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('heading', { level: 1 })),
    },
    {
      label: 'Heading 2',
      icon: HEADING_ICONS[2],
      keywords: ['heading', 'h2', 'subtitle'],
      run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('heading', { level: 2 })),
    },
    {
      label: 'Heading 3',
      icon: HEADING_ICONS[3],
      keywords: ['heading', 'h3', 'title'],
      run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('heading', { level: 3 })),
    },
  ],
};
