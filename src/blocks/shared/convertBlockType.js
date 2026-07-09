import { genId } from '../../utils/idGen.js';
import { insertBlock, removeBlock, setBlockContentIds, updateBlockProps } from '../../store/operations.js';

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
 * Returns `{ ops, newBlockId }` rather than applying anything itself — the
 * caller folds `ops` into its own batch (e.g. alongside an `updateRun` that
 * strips a matched markdown-shortcut prefix from the first run), so the
 * whole thing is one atomic undo step.
 */
export function convertBlockType(store, blockId, type, props, runIds) {
  const block = store.getBlock(blockId);
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const targetUsesTitleRunIds = 'titleRunIds' in props;
  const sourceUsesTitleRunIds = 'titleRunIds' in (block.props ?? {});

  const newBlock = { id: genId(), type, parentId: block.parentId, contentIds: [], props };

  const transferOp = targetUsesTitleRunIds
    ? updateBlockProps(newBlock.id, { titleRunIds: runIds })
    : setBlockContentIds(newBlock.id, runIds);

  const detachOp = sourceUsesTitleRunIds
    ? updateBlockProps(blockId, { titleRunIds: [] })
    : setBlockContentIds(blockId, []);

  return {
    newBlockId: newBlock.id,
    ops: [
      insertBlock(newBlock, block.parentId, index, { blocks: [newBlock], runs: [] }),
      transferOp,
      detachOp,
      removeBlock(blockId),
    ],
  };
}
