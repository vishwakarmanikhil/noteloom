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

/** Registers every built-in block type on the given registry. */
export function registerBuiltInBlocks(registry) {
  registry.register('paragraph', paragraphBlockType);
  registry.register('heading', headingBlockType);
  registry.register('listItem', listItemBlockType);
  registry.register('table', tableBlockType);
  registry.register('tableRow', tableRowBlockType);
  registry.register('tableCell', tableCellBlockType);
  registry.register('layout', layoutBlockType);
  registry.register('layoutColumn', layoutColumnBlockType);
  registry.register('divider', dividerBlockType);
  registry.register('callout', calloutBlockType);
  registry.register('blockquote', blockquoteBlockType);
  registry.register('code', codeBlockType);
  registry.register('toggleHeading', toggleHeadingBlockType);
  registry.register('button', buttonBlockType);
  registry.register('embed', embedBlockType);
}
