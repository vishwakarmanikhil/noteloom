import { paragraphBlockType } from './paragraph/index.js';
import { headingBlockType } from './heading/index.js';
import { listItemBlockType } from './listItem/index.js';
import { tableBlockType, tableRowBlockType, tableCellBlockType } from './table/index.js';
import { layoutBlockType, layoutColumnBlockType } from './layout/index.js';
import { dividerBlockType } from './divider/index.js';
import { calloutBlockType } from './callout/index.js';
import { blockquoteBlockType } from './blockquote/index.js';
import { codeBlockType } from './code/index.js';
import { toggleHeadingBlockType } from './toggleHeading/index.js';
import { buttonBlockType } from './button/index.js';
import { embedBlockType } from './embed/index.js';
import { canvasBlockType } from './canvas/index.js';

/** Registers every built-in block type on the given registry. */
export function registerBuiltInBlocks(registry) {
  registerBlocks(registry, {
    paragraph: paragraphBlockType,
    heading: headingBlockType,
    listItem: listItemBlockType,
    ...TABLE_BLOCKS,
    ...LAYOUT_BLOCKS,
    divider: dividerBlockType,
    callout: calloutBlockType,
    blockquote: blockquoteBlockType,
    code: codeBlockType,
    toggleHeading: toggleHeadingBlockType,
    button: buttonBlockType,
    embed: embedBlockType,
    canvas: canvasBlockType,
  });
}

/**
 * Registers only the block types you name — the opt-in counterpart to
 * `registerBuiltInBlocks`, for a consumer who wants (say) just paragraph,
 * heading, and table, with nothing else's code even reachable from their
 * bundle. `blocksByType` is `{ [type]: blockTypeEntry }`; every built-in
 * block type object below (`paragraphBlockType`, `tableBlockType`, ...) is
 * published individually for exactly this purpose — plain, tree-shakeable
 * values, not something living only inside this file's own registration
 * call.
 *
 * `table` and `layout` are each three/two block types that only work
 * together (a table with no `tableRow`/`tableCell` registered can't render
 * its own rows) — see `TABLE_BLOCKS`/`LAYOUT_BLOCKS` below, spread the
 * whole group in rather than picking pieces of one apart.
 */
export function registerBlocks(registry, blocksByType) {
  for (const [type, entry] of Object.entries(blocksByType)) {
    registry.register(type, entry);
  }
}

/** `table` needs its row/cell block types registered alongside it — spread this whole group in together. */
export const TABLE_BLOCKS = {
  table: tableBlockType,
  tableRow: tableRowBlockType,
  tableCell: tableCellBlockType,
};

/** `layout` needs its column block type registered alongside it — spread this whole group in together. */
export const LAYOUT_BLOCKS = {
  layout: layoutBlockType,
  layoutColumn: layoutColumnBlockType,
};

export {
  paragraphBlockType,
  headingBlockType,
  listItemBlockType,
  tableBlockType,
  tableRowBlockType,
  tableCellBlockType,
  layoutBlockType,
  layoutColumnBlockType,
  dividerBlockType,
  calloutBlockType,
  blockquoteBlockType,
  codeBlockType,
  toggleHeadingBlockType,
  buttonBlockType,
  embedBlockType,
  canvasBlockType,
};
