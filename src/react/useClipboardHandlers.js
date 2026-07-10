import { useCallback } from 'react';
import { useEditorStore, useBlockRegistry, useInlineRegistry, useWholeDocumentSelection, useBlockRangeSelection } from './EditorProvider.jsx';
import { serializeBlockRange } from '../clipboard/serialize.js';
import { deserializeClipboard } from '../clipboard/deserialize.js';
import { APP_MIME } from '../clipboard/mimeType.js';
import { insertBlock, removeBlock, updateRun } from '../store/operations.js';
import { resolveMultiRunSelection, resolveCrossBlockSelection, resolveCollapsedCaret } from './selectionResolve.js';
import { deleteRunRangeInBlock, deleteOverBlockRange, deleteEntireDocument } from '../inline/deleteCommands.js';
import { deleteBlockRange } from '../blocks/shared/blockRangeActions.js';
import { focusRunAtOffset } from './focusRun.js';

function closestBlockId(node) {
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  while (el && typeof el.hasAttribute === 'function' && !el.hasAttribute('data-block-id')) {
    el = el.parentElement;
  }
  return el?.getAttribute?.('data-block-id') ?? null;
}

/**
 * v0.1 selection-range resolution: maps the native selection's anchor/focus
 * to the nearest [data-block-id] ancestor and, if they differ, to a
 * contiguous sibling range under their shared parent. Partial-text selection
 * within a single block still copies that block's whole HTML — full
 * character-level range slicing is a follow-up once store/selection.js
 * (logical {blockId, offset} tracking) is built.
 */
function resolveSelectedBlockIds(store) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return [];

  const startId = closestBlockId(selection.anchorNode);
  const endId = closestBlockId(selection.focusNode);
  if (!startId) return [];
  if (!endId || startId === endId) return [startId];

  const startBlock = store.getBlock(startId);
  const parent = startBlock && store.getBlock(startBlock.parentId);
  if (!parent) return [startId];

  const ids = parent.contentIds;
  const i1 = ids.indexOf(startId);
  const i2 = ids.indexOf(endId);
  if (i1 === -1 || i2 === -1) return [startId];

  const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
  return ids.slice(from, to + 1);
}

/** Deletes whatever's currently selected (same-block or cross-sibling-block), if anything. Returns the resulting `{ blockId, runId, offset }`, or null if there was no selection to delete. */
function deleteCurrentSelection(store) {
  const same = resolveMultiRunSelection();
  if (same) return deleteRunRangeInBlock(store, same.blockId, same);

  const cross = resolveCrossBlockSelection(store);
  if (cross) return deleteOverBlockRange(store, cross);

  return null;
}

/** Splices `text` into an existing text run at `caret.offset` — one atomic undo step, in place, no new block. Returns the resulting caret position, or null if `caret` doesn't point at a plain text run. */
function insertTextAtCaret(store, caret, text) {
  const run = store.getRun(caret.runId);
  if (!run || run.type !== 'text') return null;
  const value = run.value ?? '';
  const newValue = value.slice(0, caret.offset) + text + value.slice(caret.offset);
  store.applyOperation(updateRun(run.id, { value: newValue }));
  return { blockId: caret.blockId, runId: run.id, offset: caret.offset + text.length };
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

export function useClipboardHandlers() {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();
  const [isWholeDocumentSelected, setIsWholeDocumentSelected] = useWholeDocumentSelection();
  const [selectedBlockRange, setSelectedBlockRange] = useBlockRangeSelection();

  const onCopy = useCallback(
    (event) => {
      // Priority: whole-document select-all > a drag-selected block range
      // (see useBlockRangeDrag) > the native browser Selection. Only one of
      // these is ever meaningfully active at once in practice (starting
      // any of the others clears the rest), but the order still matters if
      // more than one happens to be non-empty.
      const blockIds = isWholeDocumentSelected
        ? (store.getBlock(store.getRootId())?.contentIds ?? [])
        : selectedBlockRange.length > 0
          ? selectedBlockRange
          : resolveSelectedBlockIds(store);
      if (blockIds.length === 0) return;
      const { html, text, json } = serializeBlockRange(store, registry, blockIds, inlineRegistry);
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData(APP_MIME, json);
      event.preventDefault();
    },
    [store, registry, inlineRegistry, isWholeDocumentSelected, selectedBlockRange],
  );

  // Cut = copy, then delete whatever was selected — same "delete selection"
  // primitive a cross-block Backspace/Delete keypress uses (see
  // useEditorKeyboardShortcuts), reused here instead of duplicated. One
  // atomic undo step for the deletion (copying doesn't touch the store).
  const onCut = useCallback(
    (event) => {
      onCopy(event);
      if (isWholeDocumentSelected) {
        const result = deleteEntireDocument(store);
        setIsWholeDocumentSelected(false);
        if (result?.runId) focusRunAtOffset(result.runId, result.offset);
        return;
      }
      if (selectedBlockRange.length > 0) {
        deleteBlockRange(store, selectedBlockRange);
        setSelectedBlockRange([]);
        return;
      }
      const result = deleteCurrentSelection(store);
      if (result?.runId) focusRunAtOffset(result.runId, result.offset);
    },
    [onCopy, store, isWholeDocumentSelected, setIsWholeDocumentSelected, selectedBlockRange, setSelectedBlockRange],
  );

  const onPaste = useCallback(
    (event) => {
      const inserts = deserializeClipboard(event.clipboardData, registry, inlineRegistry);
      if (inserts.length === 0) return;

      if (isWholeDocumentSelected) {
        const rootId = store.getRootId();
        const contentIds = store.getBlock(rootId)?.contentIds ?? [];
        const ops = contentIds.map((id) => removeBlock(id));
        let rootIndex = 0;
        for (const { block, runs, subtreeBlocks = [] } of inserts) {
          block.parentId = rootId;
          ops.push(insertBlock(block, rootId, rootIndex, { blocks: [block, ...subtreeBlocks], runs }));
          rootIndex += 1;
        }
        applyOps(store, ops);
        setIsWholeDocumentSelected(false);
        event.preventDefault();
        return;
      }

      // Same idea, scoped to a drag-selected block range instead of the
      // whole document: the range is removed and the pasted block(s) take
      // its place, starting at the range's former position.
      if (selectedBlockRange.length > 0) {
        const first = store.getBlock(selectedBlockRange[0]);
        const parentId = first?.parentId ?? null;
        const parent = parentId && store.getBlock(parentId);
        let index = parent ? parent.contentIds.indexOf(selectedBlockRange[0]) : 0;

        const ops = selectedBlockRange.map((id) => removeBlock(id));
        for (const { block, runs, subtreeBlocks = [] } of inserts) {
          block.parentId = parentId;
          ops.push(insertBlock(block, parentId, index, { blocks: [block, ...subtreeBlocks], runs }));
          index += 1;
        }
        applyOps(store, ops);
        setSelectedBlockRange([]);
        event.preventDefault();
        return;
      }

      // Pasting over an active selection replaces it, rather than leaving
      // the old selected content sitting next to the newly-inserted
      // blocks — same "delete selection" primitive as Cut/cross-block
      // Backspace. Its own atomic undo step, separate from the insertion
      // below.
      const deleteResult = deleteCurrentSelection(store);

      // Simple, single-run plain-text paste — by far the common case (a
      // word, a phrase, a URL) — splices directly into the run at the
      // caret instead of always creating a whole new sibling block,
      // matching ProseMirror/TipTap. Multi-block or structured clipboard
      // content (tables, lists, several paragraphs) still inserts as new
      // block(s) after the current one; splitting the current block
      // around it is a further follow-up.
      const isSimpleTextPaste =
        inserts.length === 1 && inserts[0].runs.every((r) => r.type === 'text') && (inserts[0].subtreeBlocks ?? []).length === 0;

      if (isSimpleTextPaste) {
        const caret = deleteResult
          ? { blockId: deleteResult.blockId, runId: deleteResult.runId, offset: deleteResult.offset }
          : resolveCollapsedCaret();
        if (caret) {
          const text = inserts[0].runs.map((r) => r.value).join('');
          const result = insertTextAtCaret(store, caret, text);
          if (result) {
            focusRunAtOffset(result.runId, result.offset);
            event.preventDefault();
            return;
          }
        }
      }

      const atBlockId = deleteResult?.blockId ?? closestBlockId(window.getSelection?.()?.anchorNode);
      if (!atBlockId) return;

      const current = store.getBlock(atBlockId);
      if (!current) return;
      const parent = store.getBlock(current.parentId);
      let index = parent.contentIds.indexOf(atBlockId) + 1;

      const insertOps = [];
      for (const { block, runs, subtreeBlocks = [] } of inserts) {
        block.parentId = current.parentId;
        insertOps.push(insertBlock(block, current.parentId, index, { blocks: [block, ...subtreeBlocks], runs }));
        index += 1;
      }
      // One atomic undo step for the whole paste, regardless of how many
      // blocks it inserts — previously each was its own separate step.
      applyOps(store, insertOps);

      event.preventDefault();
    },
    [store, registry, inlineRegistry, isWholeDocumentSelected, setIsWholeDocumentSelected, selectedBlockRange, setSelectedBlockRange],
  );

  return { onCopy, onCut, onPaste };
}
