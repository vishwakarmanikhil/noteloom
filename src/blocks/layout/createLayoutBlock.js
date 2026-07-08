import { genId } from '../../utils/idGen.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

/** factory(parentId) -> {block, runs, subtreeBlocks} for a fresh N-column layout. */
export function createLayoutBlock({ columns = 2 } = {}) {
  return function factory(parentId) {
    const layoutId = genId();
    const subtreeBlocks = [];
    const allRuns = [];
    const columnIds = [];

    for (let c = 0; c < columns; c += 1) {
      const columnId = genId();
      // seed each column with one empty paragraph so there's somewhere to type
      const { block: paragraphBlock, runs } = createTextLeafBlock('paragraph')(columnId);
      const columnBlock = { id: columnId, type: 'layoutColumn', parentId: layoutId, contentIds: [paragraphBlock.id], props: {} };
      subtreeBlocks.push(columnBlock, paragraphBlock);
      allRuns.push(...runs);
      columnIds.push(columnId);
    }

    const block = { id: layoutId, type: 'layout', parentId, contentIds: columnIds, props: {} };
    return { block, runs: allRuns, subtreeBlocks };
  };
}
