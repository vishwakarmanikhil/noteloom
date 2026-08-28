import { LayoutBlock } from './LayoutBlock.jsx';
import { defineBlock } from '../../registry/define.js';
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

// Markdown has no native side-by-side-columns syntax — columns are just
// stacked one after another, each child still going through its own real
// toMarkdown (not toPlainText) so formatting nested inside a layout isn't
// silently lost.
function containerToMarkdown(block, ctx) {
  return block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      const entry = ctx.registry.get(child.type);
      return (entry.toMarkdown ?? entry.toPlainText)(child, ctx);
    })
    .join('\n\n');
}

export const layoutColumnBlockType = defineBlock({
  name: 'layoutColumn',
  contentModel: 'blocks',
  component: LayoutColumnBlock,
  defaultProps: {},
  toHTML: containerToHTML('<div>', '</div>'),
  toPlainText: containerToPlainText,
  toMarkdown: containerToMarkdown,
  // no fromHTML: a bare column has no distinct HTML representation of its
  // own outside a parent `layout`'s markup; layout.fromHTML would construct
  // both together if/when generic multi-column HTML import is added.
});

export const layoutBlockType = defineBlock({
  name: 'layout',
  contentModel: 'blocks',
  component: LayoutBlock,
  defaultProps: {},
  toHTML: containerToHTML('<div style="display:flex;gap:1em">', '</div>'),
  toPlainText: containerToPlainText,
  toMarkdown: containerToMarkdown,
  slashCommands: [2, 3, 4, 5].map((columns) => ({
    label: `${columns} columns`,
    icon: ColumnsIcon,
    keywords: ['layout', 'columns', 'column', String(columns)],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createLayoutBlock({ columns })),
  })),
});
