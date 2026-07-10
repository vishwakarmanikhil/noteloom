import { focusRunEnd } from '../../react/focusRun.js';
import { resolveBlockLastRun } from './navigationCommands.js';

/**
 * Resolves what to do with focus after a merge/delete operation returns
 * `focusBlockId` — normally focus the end of its last *focusable* run, but
 * if there's truly nothing to put a caret in (e.g. the current block's own
 * empty content was just deleted, landing "focus" on a divider/embed
 * sibling), select/highlight it instead, via the exact same select-then-
 * delete flow as backspacing straight into a non-editable neighbor (see
 * EditableBlockContent's selectOrDeleteContentlessNeighbor) — this is what
 * makes that flow reachable at all for "empty paragraph right after an
 * image": the empty paragraph is deleted first (ordinary empty-block
 * Backspace), *then* the image becomes selected, rather than the image
 * jumping straight to selected before the empty paragraph itself ever
 * goes away.
 *
 * Uses resolveBlockLastRun (not focusBlockId's own contentIds directly) so
 * this also does the right thing when focusBlockId is a *container* — e.g.
 * backspacing away the block right after a callout should land the caret
 * at the end of the callout's own last child, not fail silently because a
 * container's contentIds are child block ids, not run ids.
 */
export function focusAfterMerge(store, focusBlockId, currentBlockId, setSelectedBlockId) {
  if (!focusBlockId || focusBlockId === currentBlockId) return;
  const lastRunId = resolveBlockLastRun(store, focusBlockId);
  if (lastRunId) {
    focusRunEnd(lastRunId);
    return;
  }
  setSelectedBlockId(focusBlockId);
  // The current block (whose empty content just got deleted) is gone from
  // the DOM entirely, so — unlike EditableBlockContent's own select-then-
  // delete flow, which deliberately never steals focus away from a block
  // that's still there — nothing else has focus here. Move it onto the
  // now-selected non-editable block directly (divider/embed both set
  // tabIndex={-1} for exactly this) so the surface's own keydown listener
  // keeps capturing the next Backspace/Delete.
  requestAnimationFrame(() => {
    document.querySelector(`[data-block-id="${focusBlockId}"]`)?.focus();
  });
}
