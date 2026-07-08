import { resolveMultiRunSelection, resolveCollapsedCaret } from './selectionResolve.js';
import { isRunsEmpty } from '../blocks/shared/blockEmpty.js';

function getBlockRunIds(store, blockId) {
  const block = store.getBlock(blockId);
  return block?.props?.titleRunIds ?? block?.contentIds ?? [];
}

/**
 * True when the current (non-collapsed) selection exactly spans one
 * block's own content, start to end. The trigger for promoting a second
 * Ctrl+A press from "select this block" (already true via native browser
 * behavior — Ctrl+A in a focused contentEditable region selects only that
 * region by default, no code needed) to "select the whole document".
 */
export function isEntireBlockSelected(store) {
  const selection = resolveMultiRunSelection();
  if (!selection) return false; // collapsed, or already spans multiple blocks

  const { blockId, startRunId, startOffset, endRunId, endOffset } = selection;
  const runIds = getBlockRunIds(store, blockId);
  if (runIds.length === 0) return false;

  const startIndex = runIds.indexOf(startRunId);
  const endIndex = runIds.indexOf(endRunId);
  if (startIndex === -1 || endIndex === -1) return false;

  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const fromOffset = startIndex <= endIndex ? startOffset : endOffset;
  const toOffset = startIndex <= endIndex ? endOffset : startOffset;
  if (fromIndex !== 0 || toIndex !== runIds.length - 1 || fromOffset !== 0) return false;

  const lastRun = store.getRun(runIds[runIds.length - 1]);
  const lastLength = lastRun?.type === 'text' ? (lastRun.value ?? '').length : 1; // atomic run: one selectable "unit"
  return toOffset === lastLength;
}

/**
 * True when the caret sits in a block with no real content at all — e.g. a
 * heading just created from the slash menu, before anything's been typed
 * into it. An empty block has nothing for native Ctrl+A to actually
 * select, so the resulting selection stays collapsed no matter how many
 * times it's pressed — isEntireBlockSelected requires a *non-collapsed*
 * selection and can never detect "fully selected" for it, meaning a
 * second Ctrl+A press would never promote to whole-document mode (the
 * exact bug this fixes: select-all silently doing nothing on a freshly
 * created, still-empty block, while working fine on one that already had
 * text). Treating an empty current block as already "fully selected"
 * lets the very first Ctrl+A press jump straight to selecting the whole
 * document instead — there's nothing meaningful to select in between.
 */
export function isCurrentBlockEmpty(store) {
  const caret = resolveCollapsedCaret();
  if (!caret) return false;
  return isRunsEmpty(store, getBlockRunIds(store, caret.blockId));
}
