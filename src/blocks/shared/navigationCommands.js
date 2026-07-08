import { focusRunEnd } from '../../react/focusRun.js';

function adjacentSiblingId(store, blockId, direction) {
  const block = store.getBlock(blockId);
  const parent = block && store.getBlock(block.parentId);
  if (!parent) return null;
  const index = parent.contentIds.indexOf(blockId);
  const adjacentIndex = direction === 'up' ? index - 1 : index + 1;
  if (adjacentIndex < 0 || adjacentIndex >= parent.contentIds.length) return null;
  return parent.contentIds[adjacentIndex];
}

/**
 * Resolves which run id should receive focus when moving from `blockId` in
 * `direction` ('up' | 'down') — pure logic, no DOM, so it's directly
 * testable. When the adjacent sibling is a container with actual content
 * (a table with rows, a layout with columns holding blocks), this *enters*
 * it — landing in its first cell/child when moving down, or its last when
 * moving up — via resolveBlockFirstRun/resolveBlockLastRun. Only a sibling
 * with truly nothing focusable at all (a divider, or an empty table with
 * zero rows) gets skipped over entirely, continuing the search to the next
 * sibling after it.
 */
export function resolveAdjacentFocusTarget(store, blockId, direction) {
  let currentId = blockId;
  while (true) {
    const adjacentId = adjacentSiblingId(store, currentId, direction);
    if (!adjacentId) return null;
    const runId = direction === 'up' ? resolveBlockLastRun(store, adjacentId) : resolveBlockFirstRun(store, adjacentId);
    if (runId) return runId;
    currentId = adjacentId; // truly empty (no rows/children at all): keep walking past it
  }
}

/** Moves focus to the nearest focusable sibling block's text in `direction` (see resolveAdjacentFocusTarget). */
export function focusAdjacentBlock(store, blockId, direction) {
  const targetRunId = resolveAdjacentFocusTarget(store, blockId, direction);
  if (targetRunId) focusRunEnd(targetRunId);
}

/**
 * Resolves the first directly-focusable run inside `blockId`, descending
 * into containers as needed — a leaf's own contentIds/titleRunIds are
 * already run ids, but a table's contentIds are row *block* ids (recurse
 * into the first row, then its first cell, then that cell's runs), and
 * likewise for a layout's columns. Used to focus into a block right after
 * it's created (Enter, a slash command), so the caret always lands
 * somewhere typeable instead of staying on the block that triggered it.
 */
export function resolveBlockFirstRun(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;
  const runIds = block.props?.titleRunIds ?? block.contentIds;
  if (!runIds || runIds.length === 0) return null;
  const firstId = runIds[0];
  if (store.getRun(firstId)) return firstId; // a leaf's ids are runs directly
  return resolveBlockFirstRun(store, firstId); // a container's ids are child blocks: recurse
}

/** Moves focus to the first typeable position inside `blockId` (see resolveBlockFirstRun). */
export function focusBlockStart(store, blockId) {
  const runId = resolveBlockFirstRun(store, blockId);
  if (runId) focusRunEnd(runId);
}

/** Symmetric to resolveBlockFirstRun: the last directly-focusable run inside `blockId`, descending into containers' last child. */
export function resolveBlockLastRun(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;
  const runIds = block.props?.titleRunIds ?? block.contentIds;
  if (!runIds || runIds.length === 0) return null;
  const lastId = runIds[runIds.length - 1];
  if (store.getRun(lastId)) return lastId;
  return resolveBlockLastRun(store, lastId);
}

/** Moves focus to the last typeable position inside `blockId` (see resolveBlockLastRun). */
export function focusBlockEnd(store, blockId) {
  const runId = resolveBlockLastRun(store, blockId);
  if (runId) focusRunEnd(runId);
}
