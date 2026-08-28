import { defineBlock, operations } from 'noteloom';
import { RatingBlock } from './RatingBlock.jsx';

// A whole custom block type, authored only through the public API:
// `defineBlock()` for the definition, `operations` for the slash command's
// edit. No imports from inside the package.
export const ratingBlock = defineBlock({
  name: 'rating', // the block `type`
  component: RatingBlock, // renders it; gets { id }
  contentModel: 'void', // no text and no child blocks — the value lives in props (like divider/embed)
  defaultProps: { value: 0 },
  toPlainText: (block) => `Rating: ${block.props?.value ?? 0}/5`,
  toHTML: (block) => `<p>Rating: ${block.props?.value ?? 0}/5</p>`,
  slashCommand: {
    label: 'Rating',
    keywords: ['rating', 'stars'],
    // `run` gets (store, { blockId, runId, sliceStart, sliceEnd }) — where
    // "/rating" was typed, so it can be erased before the real block is
    // inserted right after it.
    run(store, { runId, sliceStart, sliceEnd, blockId }) {
      const run = store.getRun(runId);
      const value = run?.value ?? '';
      store.applyOperation(
        operations.updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }),
      );

      const current = store.getBlock(blockId);
      const parent = store.getBlock(current.parentId);
      const index = parent.contentIds.indexOf(blockId) + 1;
      store.applyOperation(
        operations.insertBlock(
          {
            id: crypto.randomUUID(),
            type: 'rating',
            parentId: current.parentId,
            contentIds: [],
            props: { value: 0 },
          },
          current.parentId,
          index,
        ),
      );
    },
  },
});
