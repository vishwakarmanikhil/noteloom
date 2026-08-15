import { insertSiblingAfterAndFocus } from '../../blocks/shared/blockCommands.js';
import { createTextLeafBlock } from '../../blocks/shared/leafBlockFactory.js';
import { focusRunEnd } from '../../react/focusRun.js';

/**
 * Used after picking a value on a freshly-inserted select/custom-select
 * chip (see SelectInlineNode/CustomSelectInlineNode's own handleChange) —
 * completes the postponed "land the caret right after the chip" step that
 * a normal (non-auto-opening) insertion already does immediately via
 * `insertInlineRunAtCursor`'s own `focusRunEnd(afterRun.id)`. An
 * auto-opening insertion deliberately skips that at insertion time (see
 * insertInlineRunAtCursor's `autoOpen` option) so the picker can take
 * focus instead — this is that same trailing-run focus, just deferred
 * until the picker interaction actually finishes.
 *
 * Resolves the target by walking `chipRunId`'s own position in `blockId`'s
 * own run array and taking whatever comes right after it — this is the
 * SAME block the chip lives in, not a different sibling block. That run
 * array is `contentIds` for a plain leaf block (paragraph, heading,
 * tableCell, ...), but `props.titleRunIds` for a listItem/toggleHeading,
 * whose own `contentIds` instead holds nested child blocks — same
 * dual-path convention `REPLACE_RUN_SPAN`/`SET_BLOCK_RUNS` already use in
 * EditorStore.js (checking `titleRunIds` first is what actually fixes list
 * items here: `chipRunId` is never IN `contentIds` for one, since that
 * array holds nested list-item block ids, not runs, so the old
 * contentIds-only lookup always failed and fell through to the "create a
 * new paragraph" fallback below for every single list item).
 *
 * `insertInlineRunAtCursor` always creates that trailing run (empty string
 * if the chip was inserted at the very end of the existing text), so it's
 * there to find under normal circumstances; the "no trailing run at all"
 * branch below is a defensive fallback for the case something else
 * removed it in between (a fresh paragraph is inserted and focused
 * instead, so there's always somewhere typeable — never a stranded caret
 * on the chip's own non-text trigger button).
 */
export function focusAfterChip(store, blockId, chipRunId) {
  const block = store.getBlock(blockId);
  const runIds = block?.props?.titleRunIds ?? block?.contentIds ?? [];
  const chipIndex = runIds.indexOf(chipRunId);
  const afterRunId = chipIndex >= 0 ? runIds[chipIndex + 1] : undefined;
  if (afterRunId) {
    focusRunEnd(afterRunId);
    return;
  }
  insertSiblingAfterAndFocus(store, blockId, createTextLeafBlock('paragraph'));
}
