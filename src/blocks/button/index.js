import { ButtonBlock } from './ButtonBlock.jsx';
import { runToHTML, runToPlainText, escapeAttr } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createButtonBlock } from './createButtonBlock.js';
import { ButtonIcon } from '../../react/icons.jsx';

// Distinctive class (not just a bare <a>) so this never collides with an
// ordinary link pasted from elsewhere — walkDomToBlocks's generic matcher
// loop only claims an anchor as a button when this exact marker is present;
// any other <a> falls through to the normal inline-link-within-a-paragraph
// handling, which is what plain link pasting should do.
const MARKER_CLASS = 'be-button-block-link';

function toHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  const href = block.props?.href ?? '';
  const color = block.props?.color;
  const style = color ? ` style="background-color:${escapeAttr(color)}"` : '';
  const customAttrs = block.props?.customAttrs ?? [];
  const attrHTML = customAttrs
    .filter((a) => a.key?.trim())
    .map((a) => ` data-${escapeAttr(a.key.trim())}="${escapeAttr(a.value ?? '')}"`)
    .join('');
  return `<a class="${MARKER_CLASS}" href="${escapeAttr(href)}"${style}${attrHTML}>${runs.map((r) => runToHTML(r, ctx)).join('')}</a>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

function fromHTML(node, ctx) {
  if (node.tagName !== 'A' || !node.classList.contains(MARKER_CLASS)) return null;
  const runs = domInlineToRuns(node, ctx);
  const customAttrs = [];
  for (const attr of node.attributes) {
    if (attr.name.startsWith('data-')) customAttrs.push({ key: attr.name.slice(5), value: attr.value });
  }
  const block = {
    id: genId(),
    type: 'button',
    parentId: null,
    contentIds: runs.map((r) => r.id),
    props: {
      href: node.getAttribute('href') ?? '',
      color: node.style?.backgroundColor || undefined,
      customAttrs,
    },
  };
  return { block, runs };
}

export const buttonBlockType = {
  component: ButtonBlock,
  isLeaf: true,
  defaultProps: { href: '', color: '', customAttrs: [] },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Button',
    icon: ButtonIcon,
    keywords: ['button', 'link', 'cta', 'action'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createButtonBlock()),
  },
};
