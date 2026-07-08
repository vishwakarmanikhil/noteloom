import { genId } from '../../utils/idGen.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

export const DEFAULT_CALLOUT_ICON = '💡';

/**
 * factory(parentId) -> {block, runs, subtreeBlocks} for a fresh callout —
 * a plain container (same contentIds-holds-child-block-ids shape as
 * layoutColumn/page) plus an `icon` prop, seeded with one empty paragraph
 * so there's somewhere to type immediately (same convention as
 * createLayoutBlock's columns).
 */
export function createCalloutBlock({ icon = DEFAULT_CALLOUT_ICON } = {}) {
  return function factory(parentId) {
    const calloutId = genId();
    const { block: paragraphBlock, runs } = createTextLeafBlock('paragraph')(calloutId);
    const block = { id: calloutId, type: 'callout', parentId, contentIds: [paragraphBlock.id], props: { icon } };
    return { block, runs, subtreeBlocks: [paragraphBlock] };
  };
}
