import { ToggleHeadingBlock } from './ToggleHeadingBlock.jsx';
import { runToHTML, runToPlainText } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createToggleHeadingBlock } from './createToggleHeadingBlock.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { ChevronRightIcon } from '../../react/icons.jsx';

/**
 * <details>/<summary> is a genuine semantic match for a toggle heading —
 * `open` reflects the expanded state natively, so this round-trips through
 * any HTML consumer that understands plain HTML5 disclosure widgets, not
 * just this editor.
 */
function toHTML(block, ctx) {
  const { titleRunIds = [], level = 2, collapsed } = block.props;
  const titleHTML = titleRunIds.map((runId) => runToHTML(ctx.store.getRun(runId), ctx)).join('');
  const childrenHTML = block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      return ctx.registry.get(child.type).toHTML(child, ctx);
    })
    .join('');
  return `<details${collapsed ? '' : ' open'}><summary><h${level}>${titleHTML}</h${level}></summary>${childrenHTML}</details>`;
}

function toPlainText(block, ctx) {
  const { titleRunIds = [] } = block.props;
  const title = titleRunIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
  const children = block.contentIds
    .map((childId) => {
      const child = ctx.store.getBlock(childId);
      return ctx.registry.get(child.type).toPlainText(child, ctx);
    })
    .join('\n');
  return children ? `${title}\n${children}` : title;
}

/** Only reconstructs top-level <p> children on paste (matches blockquote's fromHTML scope) — deeper nested block types fall back to a single blank paragraph. */
function fromHTML(node, ctx) {
  if (node.tagName !== 'DETAILS') return null;
  const summary = [...node.children].find((c) => c.tagName === 'SUMMARY');
  const headingEl = summary?.querySelector('h1,h2,h3,h4,h5,h6');
  const level = headingEl ? Math.min(6, Math.max(1, Number(headingEl.tagName[1]))) : 2;
  const titleRuns = headingEl ? domInlineToRuns(headingEl, ctx) : [{ id: genId(), type: 'text', value: '', marks: {} }];

  const blockId = genId();
  const childBlocks = [];
  const childRuns = [];
  const contentIds = [];
  for (const child of node.children) {
    if (child === summary || child.tagName !== 'P') continue;
    const runs = domInlineToRuns(child, ctx);
    const pBlock = { id: genId(), type: 'paragraph', parentId: blockId, contentIds: runs.map((r) => r.id), props: {} };
    childBlocks.push(pBlock);
    childRuns.push(...runs);
    contentIds.push(pBlock.id);
  }
  if (contentIds.length === 0) {
    const { block: fallback, runs } = createTextLeafBlock('paragraph')(blockId);
    childBlocks.push(fallback);
    childRuns.push(...runs);
    contentIds.push(fallback.id);
  }

  const block = {
    id: blockId,
    type: 'toggleHeading',
    parentId: null,
    contentIds,
    props: { level, collapsed: !node.hasAttribute('open'), titleRunIds: titleRuns.map((r) => r.id) },
  };
  return { block, runs: [...titleRuns, ...childRuns], subtreeBlocks: childBlocks };
}

export const toggleHeadingBlockType = {
  component: ToggleHeadingBlock,
  isLeaf: false,
  defaultProps: { level: 2, collapsed: false, titleRunIds: [] },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommands: [1, 2, 3].map((level) => ({
    label: `Toggle heading ${level}`,
    icon: ChevronRightIcon,
    // Deliberately does NOT include "h1"/"h2"/"h3" — those short forms
    // already belong exclusively to the plain heading commands (see
    // heading/index.js); duplicating them here would make "/h3" ambiguous
    // between "Heading 3" and "Toggle heading 3".
    keywords: ['toggle', 'heading', 'collapse', 'section'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createToggleHeadingBlock({ level })),
  })),
};
