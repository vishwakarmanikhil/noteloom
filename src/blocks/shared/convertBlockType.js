import { genId } from '../../utils/idGen.js';
import { insertBlock, removeBlock, moveBlock, setBlockContentIds, updateBlockProps } from '../../store/operations.js';

/**
 * Builds the ops that replace `blockId` in place with a new block of a
 * different type at the same position, carrying over `runIds` (reusing the
 * existing Run objects — never recreated) rather than creating new ones, so
 * any marks/text already typed survive the conversion. `props` may include
 * `titleRunIds` (for a listItem-shaped target) — `runIds` is threaded into
 * whichever of contentIds/props.titleRunIds the target type actually uses
 * (and whichever the *source* type used, when detaching).
 *
 * The new block is inserted EMPTY first, and `runIds` is only handed to it
 * via a separate setBlockContentIds/updateBlockProps op afterward — never
 * embedded directly in the insert's own subtree. This matters for undo:
 * REMOVE_BLOCK (insertBlock's inverse) recursively deletes every run still
 * reachable from the block being removed, so if the new block's *initial*
 * insert already listed `runIds` as its contentIds, undoing that insert
 * later (as part of a bigger undo replay) would delete those runs out from
 * under the old block they're being given back to. Transferring ownership
 * via its own dedicated op keeps every step's inverse a simple "restore the
 * previous list" with no recursive deletion, so runIds safely survive a
 * full undo/redo round-trip regardless of step order.
 *
 * `registry` is optional and additive — this function's two original
 * callers (markdownShortcuts.js, applyVoiceAction.js) never pass one, and
 * only ever call this on a fresh, childless, single-run paragraph, so their
 * behavior is completely unaffected by anything below. When `registry` IS
 * supplied (the "Turn into" feature), the *source* block's own nested
 * children — real child blocks in `contentIds`, distinct from a leaf's own
 * runs, true for `listItem`/`toggleHeading`/`callout` (`!registry.isLeaf`)
 * — are handled instead of being silently destroyed. Without this, they'd
 * be lost: `removeBlock` (below) recursively deletes everything still
 * reachable from the block being removed, and prior to this, nothing ever
 * moved a source's children out of its `contentIds` before that happened.
 *   - If the *target* type can also hold children (`!registry.isLeaf(type)`,
 *     e.g. listItem -> toggleHeading), the children are reparented directly
 *     onto the new block, same order, via one `moveBlock` per child.
 *   - If the target is a pure leaf (e.g. toggleHeading -> heading) and can't
 *     hold them, they're promoted to sibling blocks inserted immediately
 *     after the new one instead — content is never silently dropped.
 *
 * Returns `{ ops, newBlockId }` rather than applying anything itself — the
 * caller folds `ops` into its own batch (e.g. alongside an `updateRun` that
 * strips a matched markdown-shortcut prefix from the first run), so the
 * whole thing is one atomic undo step.
 */
export function convertBlockType(store, blockId, type, props, runIds, registry) {
  const block = store.getBlock(blockId);
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const targetUsesTitleRunIds = 'titleRunIds' in props;
  const sourceUsesTitleRunIds = 'titleRunIds' in (block.props ?? {});
  const sourceHasChildren = registry ? !registry.isLeaf(block.type) && block.contentIds.length > 0 : false;

  const newBlock = { id: genId(), type, parentId: block.parentId, contentIds: [], props };

  const transferOp = targetUsesTitleRunIds
    ? updateBlockProps(newBlock.id, { titleRunIds: runIds })
    : setBlockContentIds(newBlock.id, runIds);

  const ops = [insertBlock(newBlock, block.parentId, index, { blocks: [newBlock], runs: [] }), transferOp];

  if (sourceHasChildren) {
    const targetCanHoldChildren = !registry.isLeaf(type);
    if (targetCanHoldChildren) {
      block.contentIds.forEach((childId, i) => ops.push(moveBlock(childId, newBlock.id, i)));
    } else {
      block.contentIds.forEach((childId, i) => ops.push(moveBlock(childId, block.parentId, index + 1 + i)));
    }
  }

  // Clears whichever slot the *source* used for its own content, so
  // removeBlock below has nothing of ours still reachable through it to
  // cascade-delete. A pure-container source's contentIds (callout, once its
  // children have already been moved out above) needs no separate clearing
  // here — the moveBlock ops already emptied it as a side effect.
  if (sourceUsesTitleRunIds) {
    ops.push(updateBlockProps(blockId, { titleRunIds: [] }));
  } else if (!sourceHasChildren) {
    ops.push(setBlockContentIds(blockId, []));
  }

  ops.push(removeBlock(blockId));

  return { newBlockId: newBlock.id, ops };
}
