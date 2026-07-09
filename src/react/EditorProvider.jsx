import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const EditorContext = createContext(null);

export function EditorProvider({ store, registry, inlineRegistry = null, history = null, children }) {
  // `store` may be a plain EditorStore or a History instance (same read/write
  // surface) — components call useEditorStore() and get whichever was given,
  // undo/redo-aware or not, without caring which.
  //
  // isWholeDocumentSelected is ephemeral UI interaction state, not document
  // data — deliberately plain useState here, not part of the store. It's
  // the "select everything" flag a second Ctrl+A press sets (see
  // useEditorKeyboardShortcuts + useWholeDocumentSelection): every block
  // lives in its own separate contentEditable region, and browsers don't
  // reliably support a native Selection/Range spanning multiple independent
  // contentEditable islands constructed via script — so cross-block "select
  // all" is its own custom selection model instead of a native one, the
  // same way Notion's whole-block selection isn't native browser text
  // selection either. This package ships no default styling, so rendering
  // the corresponding highlight is left to the host app (see this hook's
  // own doc comment).
  const [isWholeDocumentSelected, setIsWholeDocumentSelected] = useState(false);

  // Preview-mode toggle — also ephemeral UI state, not document data (a
  // reload always starts back in edit mode). While true, BlockChildren
  // skips rendering the per-block gutter entirely and omits any block
  // whose own props.hidden is true, instead of rendering it dimmed the way
  // edit mode does (see BlockGutterRow's Hide/Show menu item) — the whole
  // point of "hidden" is that it disappears from the preview a reader
  // eventually sees, while staying editable (just visually dimmed) for
  // whoever's still writing it.
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Ephemeral "which custom field type is the create/edit modal open for"
  // state — null (closed), the string 'new' (create flow), or an existing
  // fieldTypes id (edit flow). See useFieldTypeEditor + FieldTypeEditorModal
  // (inlineTypes/customSelect): kept here, not in that module, so this core
  // file never has to import anything from a concrete inline type — the
  // modal itself is host-mounted (same pattern as EditorTrailingSpace),
  // reading this shared open/closed target via the hook below.
  const [fieldTypeEditorTarget, setFieldTypeEditorTarget] = useState(null);
  const openCreateFieldType = useCallback(() => setFieldTypeEditorTarget('new'), []);
  const openEditFieldType = useCallback((id) => setFieldTypeEditorTarget(id), []);
  const closeFieldTypeEditor = useCallback(() => setFieldTypeEditorTarget(null), []);

  // A single non-editable/contentless block (image, divider, etc.) that's
  // "selected" pending a second Backspace/Delete to actually remove it —
  // matching Notion/TipTap's convention for atomic nodes: the first press
  // adjacent to one just highlights it, the second one deletes it.
  //
  // Deliberately NOT React state: this can be set on every single
  // Backspace/Delete press throughout ordinary typing near a non-editable
  // block, and putting it in the same memoized context value as
  // store/registry/etc. would re-render every block in the whole document
  // on every such press (unlike isWholeDocumentSelected above, which only
  // ever changes on a deliberate, rare "select everything" action). A
  // plain ref plus a stable setter that imperatively toggles a DOM class
  // avoids that entirely — the same imperative-DOM-update discipline
  // EditableBlockContent already uses for its own host nodes.
  const selectedBlockIdRef = useRef(null);

  const getSelectedBlockId = useCallback(() => selectedBlockIdRef.current, []);

  const setSelectedBlockId = useCallback((id) => {
    const prevId = selectedBlockIdRef.current;
    if (prevId === id) return;
    if (prevId) document.querySelector(`[data-block-id="${prevId}"]`)?.classList.remove('be-block-selected');
    selectedBlockIdRef.current = id;
    if (id) document.querySelector(`[data-block-id="${id}"]`)?.classList.add('be-block-selected');
  }, []);

  const value = useMemo(
    () => ({
      store,
      registry,
      inlineRegistry,
      history,
      isWholeDocumentSelected,
      setIsWholeDocumentSelected,
      getSelectedBlockId,
      setSelectedBlockId,
      isPreviewMode,
      setIsPreviewMode,
      fieldTypeEditorTarget,
      openCreateFieldType,
      openEditFieldType,
      closeFieldTypeEditor,
    }),
    [
      store,
      registry,
      inlineRegistry,
      history,
      isWholeDocumentSelected,
      getSelectedBlockId,
      setSelectedBlockId,
      isPreviewMode,
      fieldTypeEditorTarget,
      openCreateFieldType,
      openEditFieldType,
      closeFieldTypeEditor,
    ],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('Editor hooks must be used within an <EditorProvider>');
  }
  return ctx;
}

export function useEditorStore() {
  return useEditorContext().store;
}

export function useBlockRegistry() {
  return useEditorContext().registry;
}

export function useInlineRegistry() {
  return useEditorContext().inlineRegistry;
}

/**
 * `[isWholeDocumentSelected, setIsWholeDocumentSelected]` — the custom
 * "select all" state (see EditorProvider's doc comment for why this isn't
 * a native Selection). A host app renders the highlight itself, typically
 * by conditionally adding a class to its surface element and styling
 * `.that-class > [data-block-id]` — every top-level block is a direct DOM
 * child of whatever rendered `<BlockChildren parentId={rootId} />`, so a
 * plain CSS child-combinator is enough; no wrapper markup is needed.
 */
export function useWholeDocumentSelection() {
  const { isWholeDocumentSelected, setIsWholeDocumentSelected } = useEditorContext();
  return [isWholeDocumentSelected, setIsWholeDocumentSelected];
}

/**
 * `{ getSelectedBlockId, setSelectedBlockId }` — the single-block
 * "selected, pending a second Backspace/Delete to remove it" state (see
 * EditorProvider's doc comment on selectedBlockIdRef for why this is a
 * ref-backed pair of stable functions rather than React state: reading it
 * inside an event handler via `getSelectedBlockId()` always returns the
 * current value without subscribing to it, so setting it doesn't
 * re-render every block in the document). `setSelectedBlockId` also
 * imperatively toggles the `be-block-selected` CSS class on the relevant
 * block's own `[data-block-id]` element; a host app can restyle that
 * class however it likes (a highlighted border, same as Notion/TipTap).
 */
export function useSelectedBlock() {
  const { getSelectedBlockId, setSelectedBlockId } = useEditorContext();
  return { getSelectedBlockId, setSelectedBlockId };
}

/**
 * `[isPreviewMode, setIsPreviewMode]` — toggles the whole editor between
 * edit mode (every block renders normally, hidden ones dimmed via
 * BlockGutterRow's own styling) and preview mode (BlockChildren renders
 * without the per-block gutter at all, and skips any block whose
 * `props.hidden` is true entirely — see BlockChildren's doc comment). A
 * host app wires its own toggle button/keyboard shortcut to this, same as
 * useWholeDocumentSelection.
 */
export function usePreviewMode() {
  const { isPreviewMode, setIsPreviewMode } = useEditorContext();
  return [isPreviewMode, setIsPreviewMode];
}

/**
 * `{ target, openCreate, openEdit, close }` — shared open/closed state for
 * the custom field type create/edit modal (see
 * inlineTypes/customSelect/FieldTypeEditorModal.jsx). `target` is `null`
 * when closed, `'new'` while creating, or an existing fieldTypes id while
 * editing one. A host app renders `<FieldTypeEditorModal />` once anywhere
 * under the provider (it reads this hook itself) and wires its own "+ New
 * field type" button to `openCreate()`; a field type's own chips call
 * `openEdit(id)` from their "Manage options…" popover entry (see
 * createSelectFieldType's `onManage`).
 */
export function useFieldTypeEditor() {
  const { fieldTypeEditorTarget, openCreateFieldType, openEditFieldType, closeFieldTypeEditor } = useEditorContext();
  return {
    target: fieldTypeEditorTarget,
    openCreate: openCreateFieldType,
    openEdit: openEditFieldType,
    close: closeFieldTypeEditor,
  };
}
