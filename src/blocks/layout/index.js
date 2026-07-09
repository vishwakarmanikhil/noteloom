import { LayoutBlock } from './LayoutBlock.jsx';
import { LayoutColumnBlock } from './LayoutColumnBlock.jsx';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createLayoutBlock } from './createLayoutBlock.js';
import { ColumnsIcon } from '../../react/icons.jsx';

function containerToHTML(tagOpen, tagClose) {
  return (block, ctx) =>
    `${tagOpen}${block.contentIds
      .map((childId) => {
        const child = ctx.store.getBlock(childId);
        return ctx.registry.get(child.type).toHTML(child, ctx);
      })
      .join('')}${tagClose}`;
}

function containerToPlainText(block, ctx) {
  return block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      return ctx.registry.get(child.type).toPlainText(child, ctx);
    })
    .join('\n');
}

export const layoutColumnBlockType = {
  component: LayoutColumnBlock,
  isLeaf: false,
  defaultProps: {},
  toHTML: containerToHTML('<div>', '</div>'),
  toPlainText: containerToPlainText,
  // no fromHTML: a bare column has no distinct HTML representation of its
  // own outside a parent `layout`'s markup; layout.fromHTML would construct
  // both together if/when generic multi-column HTML import is added.
};

export const layoutBlockType = {
  component: LayoutBlock,
  isLeaf: false,
  defaultProps: {},
  toHTML: containerToHTML('<div style="display:flex;gap:1em">', '</div>'),
  toPlainText: containerToPlainText,
  slashCommands: [2, 3, 4, 5].map((columns) => ({
    label: `${columns} columns`,
    icon: ColumnsIcon,
    keywords: ['layout', 'columns', 'column', String(columns)],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createLayoutBlock({ columns })),
  })),
};
