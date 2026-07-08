import { ListItemBlock } from './ListItemBlock.jsx';
import { runToHTML, runToPlainText } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createListItemBlock } from './createListItemBlock.js';

/**
 * Emits just `<li>...</li>` (with nested `<ul>/<ol>` for indented children).
 * Grouping consecutive sibling list items into one wrapping `<ul>/<ol>` is
 * the container serializer's job (see clipboard/serialize.js), not this
 * block type's — a single item doesn't know about its siblings.
 */
function toHTML(block, ctx) {
  const { titleRunIds = [], ordered } = block.props;
  const titleHTML = titleRunIds.map((runId) => runToHTML(ctx.store.getRun(runId), ctx)).join('');
  const childrenHTML = block.contentIds
    .map((childId) => ctx.registry.get(ctx.store.getBlock(childId).type).toHTML(ctx.store.getBlock(childId), ctx))
    .join('');
  const nested = childrenHTML ? `<${ordered ? 'ol' : 'ul'}>${childrenHTML}</${ordered ? 'ol' : 'ul'}>` : '';
  return `<li>${titleHTML}${nested}</li>`;
}

function toPlainText(block, ctx) {
  const { titleRunIds = [] } = block.props;
  return titleRunIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

/** Builds one list item block (+ its nested list items) from a single <li>. */
function fromLiNode(liNode, ctx) {
  const inlineNodes = [];
  const nestedListNodes = [];
  for (const child of liNode.childNodes) {
    if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
      nestedListNodes.push(child);
    } else {
      inlineNodes.push(child);
    }
  }

  const wrapper = liNode.ownerDocument.createElement('span');
  for (const n of inlineNodes) wrapper.appendChild(n.cloneNode(true));
  const titleRuns = domInlineToRuns(wrapper, ctx);

  const blockId = genId();
  const childRuns = [...titleRuns];
  const childBlocks = [];
  const contentIds = [];

  for (const listNode of nestedListNodes) {
    const ordered = listNode.tagName === 'OL';
    for (const li of listNode.children) {
      if (li.tagName !== 'LI') continue;
      const nested = fromLiNode(li, ctx);
      nested.block.parentId = blockId;
      nested.block.props.ordered = ordered;
      childBlocks.push(nested.block, ...nested.childBlocks);
      childRuns.push(...nested.runs);
      contentIds.push(nested.block.id);
    }
  }

  const block = {
    id: blockId,
    type: 'listItem',
    parentId: null,
    contentIds,
    props: { ordered: false, titleRunIds: titleRuns.map((r) => r.id) },
  };

  return { block, runs: childRuns, childBlocks };
}

function fromHTML(node, ctx) {
  if (node.tagName !== 'LI') return null;
  const { block, runs, childBlocks } = fromLiNode(node, ctx);
  return { block, runs, subtreeBlocks: childBlocks };
}

export const listItemBlockType = {
  component: ListItemBlock,
  isLeaf: false,
  defaultProps: { ordered: false, titleRunIds: [] },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommands: [
    {
      label: 'Bulleted list',
      keywords: ['list', 'bullet', 'ul'],
      run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createListItemBlock({ ordered: false })),
    },
    {
      label: 'Numbered list',
      keywords: ['list', 'number', 'ordered', 'ol'],
      run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createListItemBlock({ ordered: true })),
    },
    {
      label: 'To-do list',
      keywords: ['todo', 'checkbox', 'task', 'checklist'],
      run: (store, ctx) =>
        trimSlashQueryAndInsertAfter(store, ctx, createListItemBlock({ ordered: false, checked: false })),
    },
    {
      label: 'Toggle list',
      keywords: ['toggle', 'collapse', 'expand', 'dropdown', 'accordion'],
      run: (store, ctx) =>
        trimSlashQueryAndInsertAfter(store, ctx, createListItemBlock({ ordered: false, collapsed: false })),
    },
  ],
};
