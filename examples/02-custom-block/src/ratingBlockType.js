import { operations } from 'noteloom';
import { RatingBlock } from './RatingBlock.jsx';

// The registry entry every block type needs (see README's "Registering your
// own block/inline types") -- `component` renders it, everything else is
// for clipboard/export/the slash menu.
export const ratingBlockType = {
  component: RatingBlock,
  isLeaf: false, // no text content -- contentIds stays empty, the value lives in props
  defaultProps: { value: 0 },
  toPlainText: (block) => `Rating: ${block.props?.value ?? 0}/5`,
  toHTML: (block) => `<p>Rating: ${block.props?.value ?? 0}/5</p>`,
  slashCommand: {
    label: 'Rating',
    keywords: ['rating', 'stars'],
    // Every slashCommand's `run` gets (store, { blockId, runId, sliceStart, sliceEnd })
    // -- those describe exactly where "/rating" was typed, so it can be
    // erased before inserting the real block right after it.
    run(store, { runId, sliceStart, sliceEnd, blockId }) {
      const run = store.getRun(runId);
      const value = run?.value ?? '';
      store.applyOperation(operations.updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }));

      const current = store.getBlock(blockId);
      const parent = store.getBlock(current.parentId);
      const index = parent.contentIds.indexOf(blockId) + 1;
      store.applyOperation(
        operations.insertBlock(
          { id: crypto.randomUUID(), type: 'rating', parentId: current.parentId, contentIds: [], props: { value: 0 } },
          current.parentId,
          index,
        ),
      );
    },
  },
};
