export { EditorStore } from './store/EditorStore.js';
export { History } from './store/history.js';
export * as operations from './store/operations.js';

// Collaborative-editing merge primitives (Phase A: pure, in-memory CRDT
// core — not yet wired into EditorStore/History or any transport).
export { HLC, genPeerId } from './crdt/clock.js';
export { ListCrdtState } from './crdt/listCrdt.js';
export { FieldClockRegistry } from './crdt/fieldRegistry.js';
export { createPeriodicTombstoneGC } from './crdt/gc.js';

// WebRTC transport for live collaboration — carries the same envelopes
// EditorStore.applyRemoteOperation already knows how to merge. Bring your
// own SignalingChannel (see sync/signaling.js) to exchange connection setup.
export { CollabSession } from './sync/CollabSession.js';
export { PeerConnection } from './sync/peerConnection.js';
export { MESSAGE_TYPE, encodeMessage, decodeMessage } from './sync/syncProtocol.js';
export { createWebSocketSignaling } from './sync/websocketSignaling.js';

// Local (offline) persistence — IndexedDB-backed, native browser API, no
// added dependency. Works standalone (a single offline user) or alongside
// CollabSession (a collaborated-on document also gets saved locally).
export {
  savePersistedDocument,
  loadPersistedDocument,
  deletePersistedDocument,
  listPersistedDocumentIds,
} from './persistence/indexedDbPersistence.js';
export { createAutoPersistence } from './persistence/autoPersist.js';

export { BlockRegistry, createBlockRegistry } from './registry/blockRegistry.js';
export { InlineRegistry, createInlineRegistry } from './registry/inlineRegistry.js';

// registerBuiltInBlocks/registerBuiltInInlineTypes register EVERY built-in
// type at once — the quickest way to get a fully-featured editor running.
// For an opt-in pick of only the block/inline types you actually want,
// use registerBlocks/registerInlineTypes with
// whichever of the individual xBlockType/xInlineType values below you need
// instead — none of this is an all-or-nothing choice, since
// registerBuiltInBlocks(registry) is itself just `registerBlocks(registry,
// { paragraph: paragraphBlockType, ... })` under the hood.
export { registerBuiltInBlocks, registerBlocks, TABLE_BLOCKS, LAYOUT_BLOCKS } from './blocks/index.js';
export {
  paragraphBlockType,
  headingBlockType,
  listItemBlockType,
  tableBlockType,
  tableRowBlockType,
  tableCellBlockType,
  layoutBlockType,
  layoutColumnBlockType,
  dividerBlockType,
  calloutBlockType,
  blockquoteBlockType,
  codeBlockType,
  toggleHeadingBlockType,
  buttonBlockType,
  embedBlockType,
} from './blocks/index.js';

export { registerBuiltInInlineTypes, registerInlineTypes, TABLE_SELECT_INLINE_TYPES } from './inlineTypes/index.js';
export {
  selectInlineType,
  dateInlineType,
  checkboxInlineType,
  tableSelectInlineType,
  emojiInlineType,
} from './inlineTypes/index.js';

// The quickest path to a working editor: useEditor() creates a fully
// wired store + registries in one call, <NoteloomEditor editor={...} />
// renders it with every built-in interaction (clipboard, slash/emoji/@
// menus, floating toolbar, keyboard shortcuts, block-range drag) already
// hooked up. Everything below is still available for anyone who needs
// more control than that gives them — this is an addition, not a
// replacement for the granular API.
export { useEditor } from './react/useEditor.js';
export { NoteloomEditor } from './react/NoteloomEditor.jsx';

export {
  EditorProvider,
  useEditorStore,
  useBlockRegistry,
  useInlineRegistry,
  useWholeDocumentSelection,
  useBlockRangeSelection,
  useSelectedBlock,
  usePreviewMode,
  useFieldTypeEditor,
  useBlockClassName,
} from './react/EditorProvider.jsx';
export { injectDefaultStyles } from './react/injectDefaultStyles.js';
export { useBlock, useRun } from './react/useBlock.js';
export { useFieldTypes } from './react/useFieldTypes.js';
export { useHistory } from './react/useHistory.js';
export { usePersistedDocument } from './react/usePersistedDocument.js';
export { usePresence } from './react/usePresence.js';
export { useServiceWorkerUpdate } from './react/useServiceWorkerUpdate.js';
export { useVoiceTyping } from './react/useVoiceTyping.js';
export { VoicePermissionModal } from './react/VoicePermissionModal.jsx';
export { VoiceListeningIndicator } from './react/VoiceListeningIndicator.jsx';
export { useCaretRect } from './react/useCaretRect.js';
export { listVoiceCommands } from './voice/voiceCommands.js';
export { useBlockChildren } from './react/useBlockChildren.js';
export { useClipboardHandlers } from './react/useClipboardHandlers.js';
export { useEditorKeyboardShortcuts } from './react/useEditorKeyboardShortcuts.js';
export { BlockRenderer } from './react/BlockRenderer.jsx';
export { BlockErrorBoundary } from './react/BlockErrorBoundary.jsx';
export { BlockChildren } from './react/BlockChildren.jsx';
export { BlockGutterRow } from './react/BlockGutterRow.jsx';
export { BlockRangeActionMenu } from './react/BlockRangeActionMenu.jsx';
export { useBlockRangeDrag } from './react/useBlockRangeDrag.js';
export { useCoarsePointer } from './react/useCoarsePointer.js';
export { useVirtualKeyboardInset } from './react/useVirtualKeyboardInset.js';
export { MobileActionBar } from './react/MobileActionBar.jsx';
export { MobileBlockPickerSheet } from './react/MobileBlockPickerSheet.jsx';
export { MobileBlockOptionsSheet } from './react/MobileBlockOptionsSheet.jsx';
export { EditableBlockContent } from './react/EditableBlockContent.jsx';
export { Modal } from './react/Modal.jsx';
export { Select } from './react/Select.jsx';
export { EditorTrailingSpace } from './react/EditorTrailingSpace.jsx';

export { APP_MIME } from './clipboard/mimeType.js';
export { serializeBlockRange, remapSubtreeIds } from './clipboard/serialize.js';
export { deserializeClipboard } from './clipboard/deserialize.js';
export { walkDomToBlocks, textToParagraphs } from './clipboard/domWalk.js';
export { exportDocumentJSON, exportDocumentHTML, exportDocumentText } from './clipboard/exportDocument.js';
export { exportDocumentSimpleJSON, importDocumentSimpleJSON } from './clipboard/simpleFormat.js';
export { DocumentExportButton } from './react/DocumentExportButton.jsx';

export { SlashMenu } from './commands/SlashMenu.jsx';
export { useSlashMenuTrigger } from './commands/useSlashMenuTrigger.js';
export { useEmojiMenuTrigger } from './commands/useEmojiMenuTrigger.js';
export { useAtMenuTrigger } from './commands/useAtMenuTrigger.js';
export { FloatingToolbar } from './commands/FloatingToolbar.jsx';
export { useFloatingToolbarTrigger } from './commands/useFloatingToolbarTrigger.js';
export { useTextFormattingActions } from './commands/useTextFormattingActions.js';

export {
  insertRowAfter,
  deleteRow,
  insertColumnAfter,
  deleteColumn,
  renameColumn,
  setColumnType,
  setColumnOptions,
  setColumnWidth,
} from './blocks/table/tableEditCommands.js';
export {
  resolveColumns,
  createDefaultColumns,
  createCellForColumn,
  convertRunToType,
  blankRunForType,
  COLUMN_TYPES,
  DEFAULT_COLUMN_TYPE,
  DEFAULT_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from './blocks/table/tableColumns.js';
export { TableHeaderRow } from './blocks/table/TableHeaderRow.jsx';

export {
  toggleMarkOnRunRange,
  toggleMarkOverSelection,
  toggleMarkOverBlockRange,
  setMarksOverSelection,
  setMarksOverBlockRange,
  getMarksSummaryOverSelection,
  getMarksSummaryOverBlockRange,
} from './inline/markCommands.js';
export { deleteRunRangeInBlock, deleteOverBlockRange, deleteEntireDocument } from './inline/deleteCommands.js';
export { resolveRunSelection, resolveMultiRunSelection, resolveCrossBlockSelection, resolveCollapsedCaret } from './react/selectionResolve.js';
export { isEntireBlockSelected } from './react/selectAllCommand.js';
export { focusRunEnd, focusRunStart, focusRunAtOffset } from './react/focusRun.js';
export { ensureRootNonEmpty } from './blocks/shared/ensureRootNonEmpty.js';
export { duplicateBlock, moveBlockUp, moveBlockDown, deleteBlockAndFocusSibling } from './blocks/shared/blockActions.js';
export {
  deleteBlockRange,
  moveBlockRangeUp,
  moveBlockRangeDown,
  isEntireBlockRangeHidden,
  setBlockRangeHidden,
  reorderBlockRangeFromStore,
} from './blocks/shared/blockRangeActions.js';
export { copyBlockRangeToClipboard } from './clipboard/copyBlockRange.js';

export { createSelectFieldType } from './inlineTypes/customSelect/createSelectFieldType.jsx';
export { registerStoredFieldTypes } from './inlineTypes/customSelect/registerStoredFieldTypes.js';
export { useRegisterFieldTypes } from './inlineTypes/customSelect/useRegisterFieldTypes.js';
export { FieldTypeEditorModal } from './inlineTypes/customSelect/FieldTypeEditorModal.jsx';
