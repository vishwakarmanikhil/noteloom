import { useEffect } from 'react';
import { useEditorStore, useWholeDocumentSelection, useSelectedBlock } from './EditorProvider.jsx';
import { toggleMarkOverSelection, toggleMarkOverBlockRange } from '../inline/markCommands.js';
import { deleteOverBlockRange, deleteEntireDocument } from '../inline/deleteCommands.js';
import { resolveMultiRunSelection, resolveCrossBlockSelection } from './selectionResolve.js';
import { isEntireBlockSelected, isCurrentBlockEmpty } from './selectAllCommand.js';
import { focusRunEnd, focusRunAtOffset } from './focusRun.js';
import { deleteSelectedBlockAndRefocus } from '../blocks/shared/deleteSelectedBlock.js';
import { restoreSelectionAfterHistoryChange } from './restoreHistorySelection.js';

const MARK_KEYS = { b: 'bold', i: 'italic', u: 'underline' };

/**
 * Wires Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo),
 * Ctrl/Cmd+A (select-all, two-stage — see below), Ctrl/Cmd+B/I/U (toggle
 * bold/italic/underline on the current selection), and Backspace/Delete
 * over a selection spanning multiple blocks, at the container level.
 * Undo/redo are no-ops if `store` is a plain EditorStore rather than a
 * History instance (optional chaining on store.undo/store.redo).
 *
 * Mark toggling tries the same-block resolver first (the common case —
 * spans one or more runs within one block), then falls back to the
 * cross-block resolver for a selection spanning sibling blocks. A
 * selection spanning non-sibling blocks (different nesting depths) still
 * isn't supported.
 *
 * Select-all is two-stage, matching every other block editor (Notion,
 * Google Docs): native Ctrl+A in a focused contentEditable region already
 * selects only that block's own content — no code needed for the first
 * press. Pressing it *again*, once the whole current block is already
 * selected, promotes to a *custom* "whole document selected" state (see
 * useWholeDocumentSelection) rather than trying to construct a native
 * Selection/Range spanning every block — browsers don't reliably support a
 * script-constructed Range across multiple independent contentEditable
 * islands (each is its own "editing host"), which is exactly why this
 * editor uses one region per block in the first place. Notion's own
 * cross-block "select all" highlight isn't native browser text selection
 * either, for the same reason.
 *
 * While the whole document is selected this way: Backspace/Delete clears
 * it (via deleteEntireDocument, falling back to one blank paragraph),
 * typing a printable character replaces it with that character (matching
 * the standard "type over a selection" convention), Escape or any other
 * key cancels the mode, and Ctrl/Cmd+C/X pick it up in useClipboardHandlers.
 *
 * Backspace/Delete over an *ordinary* (native, same- or cross-sibling-
 * block) selection is handled separately below: a same-block selection is
 * left to the existing native-typing + reconcileDomToRuns/beforeinput
 * pipeline in EditableBlockContent, which already handles it correctly —
 * letting the browser delete across *multiple separate* contentEditable
 * regions is what isn't safe.
 */
export function useEditorKeyboardShortcuts(containerRef) {
  const store = useEditorStore();
  const [isWholeDocumentSelected, setIsWholeDocumentSelected] = useWholeDocumentSelection();
  const { getSelectedBlockId, setSelectedBlockId } = useSelectedBlock();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleKeyDown = (event) => {
      // A non-editable block (image/divider/...) selected pending a second
      // Backspace/Delete (see EditableBlockContent's
      // selectOrDeleteContentlessNeighbor). Two different situations reach
      // here:
      //  - The keydown bubbled up from an adjacent TEXT block's own
      //    EditableBlockContent, which already fully handled it (selected
      //    or deleted, and called preventDefault) — event.defaultPrevented
      //    is already true, so there's nothing left to do here.
      //  - The keydown landed *directly* on the already-selected, already-
      //    focused block itself (a divider/embed has no EditableBlockContent
      //    of its own to bubble through — see focusAfterMerge, which moves
      //    real DOM focus onto it once the block that used to hold it was
      //    deleted for being empty) — event.defaultPrevented is still
      //    false, so this is the only place that can delete it.
      if (getSelectedBlockId() && (event.key === 'Backspace' || event.key === 'Delete') && !event.defaultPrevented) {
        event.preventDefault();
        // This listener is native (added via addEventListener below) on an
        // ancestor of the React root's own delegated event target, so it
        // fires *before* React's synthetic onKeyDown dispatch during the
        // bubble phase. preventDefault() alone doesn't stop that dispatch —
        // without stopPropagation, the same keydown would also reach
        // whichever EditableBlockContent still has focus and be handled a
        // second time (e.g. re-evaluating its own now-stale neighbor check
        // after the divider this call just removed is already gone,
        // wrongly merging into the previous block instead of doing nothing).
        event.stopPropagation();
        deleteSelectedBlockAndRefocus(store, getSelectedBlockId(), setSelectedBlockId);
        return;
      }

      // Any other key cancels a pending selection, matching
      // isWholeDocumentSelected's own "anything else cancels" convention
      // below.
      if (getSelectedBlockId() && event.key !== 'Backspace' && event.key !== 'Delete') {
        setSelectedBlockId(null);
      }

      const mod = event.metaKey || event.ctrlKey;

      if (mod) {
        const key = event.key.toLowerCase();

        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          if (store.undo?.()) restoreSelectionAfterHistoryChange(store);
          return;
        }
        if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault();
          if (store.redo?.()) restoreSelectionAfterHistoryChange(store);
          return;
        }
        if (key === 'a') {
          if (isWholeDocumentSelected) return; // already fully selected
          if (isEntireBlockSelected(store) || isCurrentBlockEmpty(store)) {
            event.preventDefault();
            // Deliberately leave the native selection alone (still
            // highlighting just the current block) rather than clearing
            // it — Ctrl+C/X/V are native browser commands that need an
            // active selection/focus target to even dispatch a copy/cut/
            // paste event to us at all. Our onCopy/onCut/onPaste always
            // check isWholeDocumentSelected first and use every top-level
            // block when it's set, so the leftover single-block native
            // selection's actual content is never used for anything.
            setIsWholeDocumentSelected(true);
          }
          return; // first press: let native Ctrl+A select the current block
        }
        if (MARK_KEYS[key]) {
          if (isWholeDocumentSelected) return; // formatting over "select all" isn't supported yet
          event.preventDefault();
          const markName = MARK_KEYS[key];

          const sameBlockSelection = resolveMultiRunSelection();
          if (sameBlockSelection) {
            const newRunId = toggleMarkOverSelection(store, sameBlockSelection.blockId, sameBlockSelection, markName);
            if (newRunId) focusRunEnd(newRunId);
            return;
          }

          const crossBlockSelection = resolveCrossBlockSelection(store);
          if (crossBlockSelection) {
            const newRunId = toggleMarkOverBlockRange(store, crossBlockSelection, markName);
            if (newRunId) focusRunEnd(newRunId);
          }
        }
        return;
      }

      if (isWholeDocumentSelected) {
        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          event.stopPropagation();
          const result = deleteEntireDocument(store);
          setIsWholeDocumentSelected(false);
          if (result?.runId) focusRunAtOffset(result.runId, result.offset);
          return;
        }
        if (event.key.length === 1) {
          // typing a printable character over "select all" replaces the
          // whole document with it, matching every editor's "type over a
          // selection" convention.
          event.preventDefault();
          event.stopPropagation();
          const result = deleteEntireDocument(store, event.key);
          setIsWholeDocumentSelected(false);
          if (result?.runId) focusRunAtOffset(result.runId, result.offset);
          return;
        }
        // Escape, arrows, or anything else not explicitly handled: just
        // cancel the mode and let the key proceed normally.
        setIsWholeDocumentSelected(false);
        if (event.key === 'Escape') return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        const crossSelection = resolveCrossBlockSelection(store);
        if (!crossSelection) return; // same-block/collapsed: leave to EditableBlockContent's own handling

        event.preventDefault();
        event.stopPropagation(); // this block's own Backspace/Delete handler must not also run
        const result = deleteOverBlockRange(store, crossSelection);
        if (result?.runId) focusRunAtOffset(result.runId, result.offset);
      }
    };

    const handleMouseDown = () => {
      if (isWholeDocumentSelected) setIsWholeDocumentSelected(false);
      if (getSelectedBlockId()) setSelectedBlockId(null);
    };

    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('mousedown', handleMouseDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, store, isWholeDocumentSelected, setIsWholeDocumentSelected, getSelectedBlockId, setSelectedBlockId]);
}
