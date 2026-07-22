import { changeBlockType, moveBlock, setBlockContentIds, updateBlockProps } from '../../store/operations.js';

/**
 * Builds the ops that convert `blockId` to a different type IN PLACE — same
 * id, same parentId, same position among siblings — carrying over `runIds`
 * (reusing the existing Run objects — never recreated) rather than creating
 * new ones, so any marks/text already typed survive the conversion. `props`
 * may include `titleRunIds` (for a listItem-shaped target) — `runIds` is
 * threaded into whichever of contentIds/props.titleRunIds the target type
 * actually uses (and whichever the *source* type used, when detaching).
 *
 * Keeping the same id (rather than deleting the old block and inserting a
 * new one) matters beyond just simplicity: it's what lets a future
 * multi-peer merge treat two concurrent conversions of the same block as
 * one field-level conflict on that id (last-write-wins) instead of two
 * unrelated structural edits that would otherwise leave both resulting
 * blocks sitting side by side after merging.
 *
 * `registry` is optional and additive — this function's two original
 * callers (markdownShortcuts.js, applyVoiceAction.js) never pass one, and
 * only ever call this on a fresh, childless, single-run paragraph, so their
 * behavior is completely unaffected by anything below. When `registry` IS
 * supplied (the "Turn into" feature), the *source* block's own nested
 * children — real child blocks in `contentIds`, distinct from a leaf's own
 * runs, true for `listItem`/`toggleHeading`/`callout` (`!registry.isLeaf`)
 * — are handled instead of being silently orphaned:
 *   - If the *target* type can also hold children (`!registry.isLeaf(type)`,
 *     e.g. listItem -> toggleHeading), the children simply stay parented to
 *     this same block id — nothing needs to move.
 *   - If the target is a pure leaf (e.g. toggleHeading -> heading) and can't
 *     hold them, they're promoted to sibling blocks inserted immediately
 *     after this block instead — content is never silently dropped.
 *
 * Returns `{ ops, newBlockId }` rather than applying anything itself —
 * `newBlockId` is always `blockId` (kept for backward compatibility with
 * callers written when this returned a freshly generated id). The caller
 * folds `ops` into its own batch (e.g. alongside an `updateRun` that strips
 * a matched markdown-shortcut prefix from the first run), so the whole
 * thing is one atomic undo step.
 */
export function convertBlockType(store, blockId, type, props, runIds, registry) {
  const block = store.getBlock(blockId);
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const targetUsesTitleRunIds = 'titleRunIds' in props;
  const sourceUsesTitleRunIds = 'titleRunIds' in (block.props ?? {});
  const sourceHasChildren = registry ? !registry.isLeaf(block.type) && block.contentIds.length > 0 : false;
  const targetCanHoldChildren = registry ? !registry.isLeaf(type) : false;

  const ops = [];

  // Children only need to move when the target can't hold them (promoted
  // to siblings). When the target can also hold children, they're already
  // correctly parented to this same block id — nothing to do.
  if (sourceHasChildren && !targetCanHoldChildren) {
    block.contentIds.forEach((childId, i) => ops.push(moveBlock(childId, block.parentId, index + 1 + i)));
  }

  ops.push(changeBlockType(blockId, type, props));

  if (targetUsesTitleRunIds) {
    ops.push(updateBlockProps(blockId, { titleRunIds: runIds }));
    // A leaf source's old contentIds held its own runs, now superseded by
    // titleRunIds — clear it so those ids aren't misread as child blocks.
    // A container source that already used titleRunIds (or had its
    // children promoted to siblings above) already has the right
    // contentIds and needs no clearing.
    if (!sourceUsesTitleRunIds && !sourceHasChildren) {
      ops.push(setBlockContentIds(blockId, []));
    }
  } else {
    // Target keeps its own runs directly in contentIds. Any children still
    // sitting in contentIds at this point are ones the target can also
    // hold (handled above) and must be kept alongside the transferred
    // runIds, not replaced by them.
    const keepChildren = sourceHasChildren && targetCanHoldChildren ? block.contentIds : [];
    ops.push(setBlockContentIds(blockId, [...keepChildren, ...runIds]));
  }

  return { newBlockId: blockId, ops };
}
