import { insertBlock, removeBlock, updateBlockProps } from '../../store/operations.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { focusBlockStart } from '../shared/navigationCommands.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Enter on an empty, top-level (not nested under another list item),
 * childless list item exits the list entirely: it's replaced in place by
 * an empty paragraph, and focus moves there. Matches every other list
 * editor's "Enter on the last empty bullet leaves the list" convention —
 * the nested case (mergeCommands.js's outdent-on-empty) only pops one
 * level; this is the top-level equivalent that leaves the list altogether.
 */
export function exitListItemToParagraph(store, blockId) {
  const block = store.getBlock(blockId);
  const parentId = block.parentId;
  const parent = store.getBlock(parentId);
  const index = parent.contentIds.indexOf(blockId);
  const { block: paragraphBlock, runs } = createTextLeafBlock('paragraph')(parentId);

  applyOps(store, [
    insertBlock(paragraphBlock, parentId, index, { blocks: [paragraphBlock], runs }),
    updateBlockProps(blockId, { titleRunIds: [] }), // detach its own (empty) run before deleting
    removeBlock(blockId),
  ]);

  focusBlockStart(store, paragraphBlock.id);
  return paragraphBlock.id;
}
