import { removeBlock } from '../../store/operations.js';
import { isContentlessBlock } from './contentless.js';
import { ensureRootNonEmpty } from './ensureRootNonEmpty.js';
import { focusRunEnd } from '../../react/focusRun.js';

/**
 * Removes the currently-selected non-editable block (see setSelectedBlockId
 * in EditorProvider.jsx) and resolves what happens to focus next: its
 * previous sibling, or else its next sibling, or else (it was the only
 * block left) whatever ensureRootNonEmpty falls back to. If THAT target is
 * itself contentless (two dividers in a row), it becomes newly selected
 * (and focused, via tabIndex={-1} — see DividerBlock/EmbedBlock) rather
 * than focusing a run that doesn't exist; otherwise its last run is
 * focused normally.
 *
 * Shared by two different call sites that both need this exact resolution:
 * EditableBlockContent's own second-press delete (bubbled from whichever
 * adjacent text block still has focus throughout) and
 * useEditorKeyboardShortcuts' global handler (a Backspace/Delete that
 * lands *directly* on the already-selected, already-focused block itself —
 * there's no EditableBlockContent wrapping a divider/embed for that press
 * to bubble through).
 */
export function deleteSelectedBlockAndRefocus(store, selectedId, setSelectedBlockId) {
  const block = store.getBlock(selectedId);
  if (!block) {
    setSelectedBlockId(null);
    return;
  }
  const parent = store.getBlock(block.parentId);
  const idx = parent ? parent.contentIds.indexOf(selectedId) : -1;
  const prevId = idx > 0 ? parent.contentIds[idx - 1] : null;
  const nextId = idx !== -1 && idx < parent.contentIds.length - 1 ? parent.contentIds[idx + 1] : null;

  store.applyOperation(removeBlock(selectedId));
  setSelectedBlockId(null);
  const fallbackId = ensureRootNonEmpty(store);
  const landId = prevId ?? nextId ?? fallbackId;
  if (!landId) return;

  const landBlock = store.getBlock(landId);
  if (isContentlessBlock(store, landBlock)) {
    setSelectedBlockId(landId);
    requestAnimationFrame(() => document.querySelector(`[data-block-id="${landId}"]`)?.focus());
    return;
  }

  const titleRunIds = landBlock?.props?.titleRunIds;
  const lastRunId = landBlock?.contentIds?.[landBlock.contentIds.length - 1] ?? titleRunIds?.[titleRunIds.length - 1];
  if (lastRunId) focusRunEnd(lastRunId);
}
