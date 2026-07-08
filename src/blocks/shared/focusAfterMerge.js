import { isContentlessBlock } from './contentless.js';
import { focusRunEnd } from '../../react/focusRun.js';

/**
 * Resolves what to do with focus after a merge/delete operation returns
 * `focusBlockId` — normally focus the end of its last run, but if that
 * target has no runs at all to focus (e.g. the current block's own empty
 * content was just deleted, landing "focus" on a divider/embed sibling),
 * there's nothing to put a caret in. Select/highlight it instead, via the
 * exact same select-then-delete flow as backspacing straight into a
 * non-editable neighbor (see EditableBlockContent's
 * selectOrDeleteContentlessNeighbor) — this is what makes that flow
 * reachable at all for "empty paragraph right after an image": the empty
 * paragraph is deleted first (ordinary empty-block Backspace), *then* the
 * image becomes selected, rather than the image jumping straight to
 * selected before the empty paragraph itself ever goes away.
 */
export function focusAfterMerge(store, focusBlockId, currentBlockId, setSelectedBlockId) {
  if (!focusBlockId || focusBlockId === currentBlockId) return;
  const focusBlock = store.getBlock(focusBlockId);
  if (isContentlessBlock(store, focusBlock)) {
    setSelectedBlockId(focusBlockId);
    // The current block (whose empty content just got deleted) is gone
    // from the DOM entirely, so — unlike EditableBlockContent's own
    // select-then-delete flow, which deliberately never steals focus away
    // from a block that's still there — nothing else has focus here.
    // Move it onto the now-selected non-editable block directly (divider/
    // embed both set tabIndex={-1} for exactly this) so the surface's own
    // keydown listener keeps capturing the next Backspace/Delete.
    requestAnimationFrame(() => {
      document.querySelector(`[data-block-id="${focusBlockId}"]`)?.focus();
    });
    return;
  }
  const lastRunId =
    focusBlock?.contentIds?.[focusBlock.contentIds.length - 1] ??
    focusBlock?.props?.titleRunIds?.[focusBlock.props.titleRunIds.length - 1];
  if (lastRunId) focusRunEnd(lastRunId);
}
