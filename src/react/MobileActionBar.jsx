import { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from './EditorProvider.jsx';
import { useHistory } from './useHistory.js';
import { useCoarsePointer } from './useCoarsePointer.js';
import { useVirtualKeyboardInset } from './useVirtualKeyboardInset.js';
import { useTextFormattingActions } from '../commands/useTextFormattingActions.js';
import { resolveCollapsedCaret, resolveMultiRunSelection, resolveCrossBlockSelection } from './selectionResolve.js';
import { getMarksSummaryOverSelection, getMarksSummaryOverBlockRange } from '../inline/markCommands.js';
import { updateBlockProps } from '../store/operations.js';
import { insertRowAfter, insertColumnAfter } from '../blocks/table/tableEditCommands.js';
import { LANGUAGES } from '../blocks/code/CodeBlock.jsx';
import { CALLOUT_COLORS } from '../blocks/callout/CalloutBlock.jsx';
import { Select } from './Select.jsx';
import { MobileBlockPickerSheet } from './MobileBlockPickerSheet.jsx';
import { MobileBlockOptionsSheet } from './MobileBlockOptionsSheet.jsx';
import { BoldIcon, ItalicIcon, UnderlineIcon, LinkIcon, PlusIcon, MoreHorizontalIcon, ChevronDownIcon } from './icons.jsx';

const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({ value: lang, label: lang }));

/**
 * Watches focus + the live Selection to decide what MobileActionBar should
 * show: null while focus isn't inside the editor at all, 'selection' with a
 * resolved same-block/cross-block shape + marks summary while there's a
 * real (non-collapsed) text selection, or 'caret' with a resolved
 * {blockId, runId, offset} while the caret is simply parked somewhere.
 * Mirrors useFloatingToolbarTrigger's own selectionchange-driven recompute,
 * generalized to also track the collapsed-caret case that hook doesn't need.
 */
function useMobileBarState(containerRef, store) {
  const [isFocused, setIsFocused] = useState(false);
  const [mode, setMode] = useState(null);
  const [selectionState, setSelectionState] = useState(null);
  const [caretState, setCaretState] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handleFocusIn = () => setIsFocused(true);
    const handleFocusOut = (event) => {
      if (!container.contains(event.relatedTarget)) setIsFocused(false);
    };
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!isFocused) {
      setMode(null);
      return undefined;
    }

    const recompute = () => {
      const container = containerRef.current;
      const selection = window.getSelection?.();
      if (!container || !selection || selection.rangeCount === 0) {
        setMode(null);
        return;
      }

      if (!selection.isCollapsed) {
        if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
          setMode(null);
          return;
        }
        const sameBlock = resolveMultiRunSelection();
        if (sameBlock) {
          setSelectionState({
            kind: 'same-block',
            selection: sameBlock,
            crossSelection: null,
            marks: getMarksSummaryOverSelection(store, sameBlock.blockId, sameBlock),
          });
          setMode('selection');
          return;
        }
        const crossBlock = resolveCrossBlockSelection(store);
        if (crossBlock) {
          setSelectionState({
            kind: 'cross-block',
            selection: null,
            crossSelection: crossBlock,
            marks: getMarksSummaryOverBlockRange(store, crossBlock),
          });
          setMode('selection');
          return;
        }
        setMode(null);
        return;
      }

      const caret = resolveCollapsedCaret();
      if (!caret || !container.contains(selection.anchorNode)) {
        setMode(null);
        return;
      }
      setCaretState(caret);
      setMode('caret');
    };

    recompute();
    document.addEventListener('selectionchange', recompute);
    return () => document.removeEventListener('selectionchange', recompute);
  }, [isFocused, store, containerRef]);

  return { isFocused, mode, selectionState, caretState };
}

function FormattingActions({ store, selectionState }) {
  const { kind, selection, crossSelection, marks } = selectionState;
  const { toggleBoolean, openLinkModal } = useTextFormattingActions(store, kind, selection, crossSelection, marks);

  return (
    <>
      <button
        type="button"
        className={`be-mobile-bar-btn${marks.bold ? ' be-mobile-bar-btn-active' : ''}`}
        aria-label="Bold"
        onClick={() => toggleBoolean('bold')}
      >
        <BoldIcon size={18} />
      </button>
      <button
        type="button"
        className={`be-mobile-bar-btn${marks.italic ? ' be-mobile-bar-btn-active' : ''}`}
        aria-label="Italic"
        onClick={() => toggleBoolean('italic')}
      >
        <ItalicIcon size={18} />
      </button>
      <button
        type="button"
        className={`be-mobile-bar-btn${marks.underline ? ' be-mobile-bar-btn-active' : ''}`}
        aria-label="Underline"
        onClick={() => toggleBoolean('underline')}
      >
        <UnderlineIcon size={18} />
      </button>
      <button
        type="button"
        className={`be-mobile-bar-btn${marks.link ? ' be-mobile-bar-btn-active' : ''}`}
        aria-label="Link"
        onClick={openLinkModal}
      >
        <LinkIcon size={18} />
      </button>
    </>
  );
}

/** Table-cell-specific quick actions: insert a row below / a column to the right of the current cell. */
function TableCellActions({ store, blockId }) {
  const handleInsertRow = useCallback(() => {
    const cell = store.getBlock(blockId);
    const row = cell && store.getBlock(cell.parentId);
    if (row) insertRowAfter(store, row.id);
  }, [store, blockId]);

  const handleInsertColumn = useCallback(() => {
    const cell = store.getBlock(blockId);
    const row = cell && store.getBlock(cell.parentId);
    const table = row && store.getBlock(row.parentId);
    if (!table || !row) return;
    const colIndex = row.contentIds.indexOf(blockId);
    if (colIndex !== -1) insertColumnAfter(store, table.id, colIndex);
  }, [store, blockId]);

  return (
    <>
      <button type="button" className="be-mobile-bar-btn" aria-label="Insert row below" onClick={handleInsertRow}>
        + Row
      </button>
      <button type="button" className="be-mobile-bar-btn" aria-label="Insert column right" onClick={handleInsertColumn}>
        + Column
      </button>
    </>
  );
}

/** Code-block-specific quick action: change the block's language. */
function CodeBlockActions({ store, blockId }) {
  const block = store.getBlock(blockId);
  const handleLanguageChange = useCallback(
    (language) => store.applyOperation(updateBlockProps(blockId, { language })),
    [store, blockId],
  );
  return (
    <Select
      className="be-mobile-bar-select"
      value={block?.props?.language ?? 'plaintext'}
      options={LANGUAGE_OPTIONS}
      onChange={handleLanguageChange}
      ariaLabel="Code language"
    />
  );
}

/** Callout-specific quick action: the same color palette CalloutBlock's own picker offers. */
function CalloutActions({ store, blockId }) {
  const block = store.getBlock(blockId);
  const color = block?.props?.color;
  return (
    <div className="be-mobile-bar-swatches">
      {CALLOUT_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`be-callout-color-option be-callout-color-option-${c.value}${c.value === color ? ' be-callout-color-option-active' : ''}`}
          aria-label={c.label}
          title={c.label}
          onClick={() => store.applyOperation(updateBlockProps(blockId, { color: c.value }))}
        />
      ))}
    </div>
  );
}

const BLOCK_TYPE_ACTIONS = {
  tableCell: TableCellActions,
  code: CodeBlockActions,
  callout: CalloutActions,
};

/**
 * Walks up from the caret's own (leaf) block to find the nearest ancestor
 * with type-specific quick actions — needed because not every "context" is
 * itself a leaf: a table cell IS the leaf the caret resolves to directly,
 * but a callout's caret always resolves to a *nested paragraph* (callout is
 * a plain container, same mechanism as a page/layout column — see
 * CalloutBlock.jsx), so checking only the immediate leaf's own type would
 * never match 'callout' at all.
 */
function findActionableAncestor(store, blockId) {
  let current = store.getBlock(blockId);
  while (current) {
    if (BLOCK_TYPE_ACTIONS[current.type]) return current;
    current = current.parentId ? store.getBlock(current.parentId) : null;
  }
  return null;
}

/**
 * Walks up to the TOP-LEVEL ancestor of `blockId` — the same block
 * BlockGutterRow's own hover gutter would act on for this content, since
 * that gutter (and its Duplicate/Move/Hide/Delete menu) is only ever
 * mounted for top-level blocks, never nested content (a table cell, a
 * callout's children, ...). MobileActionBar's "block options" button
 * mirrors that exact scope: a caret in a table cell duplicates/moves/
 * deletes the whole table, not just that one cell.
 */
function findTopLevelAncestor(store, blockId) {
  const rootId = store.getRootId();
  let current = store.getBlock(blockId);
  while (current && current.parentId !== rootId) {
    current = store.getBlock(current.parentId);
  }
  return current;
}

/**
 * Persistent action surface pinned above the on-screen keyboard on touch
 * devices — the mobile counterpart to typing "/"/"@" or hovering the block
 * gutter, neither of which is a reliable or discoverable way to act on
 * this editor from a phone/tablet (see the mobile UX audit this was built
 * from). Mount once alongside the other trigger hooks (useSlashMenuTrigger,
 * etc.) in the same container.
 *
 * Deliberately a no-op (renders nothing) on a fine (mouse) pointer, or
 * whenever focus isn't currently inside the editor — this never appears
 * on desktop, and never lingers after the user taps away.
 *
 * "Block options" (a horizontal-dots icon — the conventional mobile "more
 * actions" affordance, not desktop's own grip-handle glyph, which reads
 * oddly outside a drag-handle context) sits at the right end of the bar,
 * next to the dismiss-keyboard button, and shows whenever the caret or
 * selection is inside any block: opens MobileBlockOptionsSheet (Duplicate/
 * Move up/Move down/Hide/Delete) — the mobile home for BlockGutterRow's
 * own grip-handle menu, which this codebase deliberately hides entirely on
 * touch input instead (see .be-touch-input in style.css) since there's no
 * hover state to reveal it by and its desktop position sits in a page
 * margin that doesn't exist on a narrow viewport.
 *
 * The rest of the bar swaps based on what's currently selected/focused:
 *  - a real text selection -> formatting actions (bold/italic/underline/
 *    link), reusing the exact same useTextFormattingActions hook
 *    FloatingToolbar (desktop) uses — one shared implementation, not two.
 *  - a collapsed caret -> "+" (opens MobileBlockPickerSheet), Undo/Redo,
 *    plus type-specific quick actions when the caret is in a table cell,
 *    code block, or callout (see BLOCK_TYPE_ACTIONS) — the "smarter than a
 *    single static bar everywhere" piece.
 */
export function MobileActionBar({ containerRef }) {
  const store = useEditorStore();
  const history = useHistory();
  const isCoarsePointer = useCoarsePointer();
  const keyboardInset = useVirtualKeyboardInset();
  const { isFocused, mode, selectionState, caretState } = useMobileBarState(containerRef, store);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  const openPicker = useCallback(() => setIsPickerOpen(true), []);
  const closePicker = useCallback(() => setIsPickerOpen(false), []);
  const openOptions = useCallback(() => setIsOptionsOpen(true), []);
  const closeOptions = useCallback(() => setIsOptionsOpen(false), []);

  const handleSelectCommand = useCallback(
    (command) => {
      const caret = resolveCollapsedCaret() ?? caretState;
      if (!caret) return;
      command.run(store, {
        blockId: caret.blockId,
        runId: caret.runId,
        sliceStart: caret.offset,
        sliceEnd: caret.offset,
      });
      closePicker();
    },
    [store, caretState, closePicker],
  );

  const handleDismissKeyboard = useCallback(() => {
    document.activeElement?.blur?.();
  }, []);

  if (!isCoarsePointer || !isFocused) return null;

  const actionableBlock = mode === 'caret' && caretState ? findActionableAncestor(store, caretState.blockId) : null;
  const TypeActions = actionableBlock ? BLOCK_TYPE_ACTIONS[actionableBlock.type] : null;

  // Whichever block the caret/selection is currently in, regardless of
  // mode — "block options" (duplicate/move/hide/delete) makes sense either
  // way, unlike "+", which only means something for a collapsed caret.
  const currentBlockId =
    mode === 'caret' && caretState
      ? caretState.blockId
      : (selectionState?.selection?.blockId ?? selectionState?.crossSelection?.startBlockId ?? null);
  const topLevelBlock = currentBlockId ? findTopLevelAncestor(store, currentBlockId) : null;

  return (
    <>
      <div
        className="be-mobile-action-bar"
        role="toolbar"
        aria-label="Editor actions"
        style={{ bottom: keyboardInset }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {mode === 'selection' && selectionState && <FormattingActions store={store} selectionState={selectionState} />}

        {mode !== 'selection' && (
          <>
            <button type="button" className="be-mobile-bar-btn" aria-label="Add block" onClick={openPicker}>
              <PlusIcon size={18} />
            </button>
            {TypeActions && actionableBlock && <TypeActions store={store} blockId={actionableBlock.id} />}
            {history && (
              <>
                <button
                  type="button"
                  className="be-mobile-bar-btn"
                  aria-label="Undo"
                  disabled={!history.canUndo}
                  onClick={history.undo}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="be-mobile-bar-btn"
                  aria-label="Redo"
                  disabled={!history.canRedo}
                  onClick={history.redo}
                >
                  ↷
                </button>
              </>
            )}
          </>
        )}

        <span className="be-mobile-bar-spacer" />
        {topLevelBlock && (
          <button type="button" className="be-mobile-bar-btn" aria-label="Block options" onClick={openOptions}>
            <MoreHorizontalIcon size={18} />
          </button>
        )}
        <button type="button" className="be-mobile-bar-btn" aria-label="Dismiss keyboard" onClick={handleDismissKeyboard}>
          <ChevronDownIcon size={18} />
        </button>
      </div>
      <MobileBlockPickerSheet isOpen={isPickerOpen} onClose={closePicker} onSelectCommand={handleSelectCommand} />
      <MobileBlockOptionsSheet
        isOpen={isOptionsOpen}
        onClose={closeOptions}
        store={store}
        blockId={topLevelBlock?.id}
      />
    </>
  );
}
