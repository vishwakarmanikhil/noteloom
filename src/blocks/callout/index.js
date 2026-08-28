import { CalloutBlock } from './CalloutBlock.jsx';
import { defineBlock } from '../../registry/define.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createCalloutBlock, DEFAULT_CALLOUT_ICON } from './createCalloutBlock.js';
import { CalloutIcon } from '../../react/icons.jsx';

function childrenToHTML(block, ctx) {
  return block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      return ctx.registry.get(child.type).toHTML(child, ctx);
    })
    .join('');
}

function toHTML(block, ctx) {
  const icon = block.props?.icon ?? DEFAULT_CALLOUT_ICON;
  return `<div class="callout" data-icon="${icon}"><div class="callout-icon">${icon}</div><div class="callout-content">${childrenToHTML(block, ctx)}</div></div>`;
}

function toPlainText(block, ctx) {
  const icon = block.props?.icon ?? DEFAULT_CALLOUT_ICON;
  const inner = block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      return ctx.registry.get(child.type).toPlainText(child, ctx);
    })
    .join('\n');
  return `${icon} ${inner}`;
}

// No native Markdown callout/aside syntax — a blockquote with the icon
// prefixed on its first line is the closest common convention (GitHub's
// own "> [!NOTE]"-style alerts are a similar idea), and degrades gracefully
// to a plain quote in any renderer that doesn't recognize alert syntax.
function toMarkdown(block, ctx) {
  const icon = block.props?.icon ?? DEFAULT_CALLOUT_ICON;
  const lines = block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      const entry = ctx.registry.get(child.type);
      return (entry.toMarkdown ?? entry.toPlainText)(child, ctx);
    })
    .join('\n')
    .split('\n');
  return lines.map((line, i) => `> ${i === 0 ? `${icon} ` : ''}${line}`).join('\n');
}

export const calloutBlockType = defineBlock({
  name: 'callout',
  contentModel: 'blocks',
  component: CalloutBlock,
  defaultProps: { icon: DEFAULT_CALLOUT_ICON },
  toHTML,
  toPlainText,
  toMarkdown,
  // No fromHTML: same precedent as layoutColumn — there's no standard
  // external HTML shape for a "callout" box, so plain-HTML paste doesn't
  // need to reconstruct one. Same-editor copy/paste is already lossless
  // via the generic block-subtree JSON clipboard path
  // (captureSubtree in clipboard/serialize.js), which walks
  // contentIds generically and needs no per-type awareness at all.
  slashCommand: {
    label: 'Callout',
    icon: CalloutIcon,
    keywords: ['callout', 'aside', 'note', 'info', 'tip', 'warning'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createCalloutBlock()),
  },
});
