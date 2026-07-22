// Hand-written type declarations for noteloom's public API (src/index.js).
// Covers the primary surface in real detail (store/CRDT/sync/persistence,
// the React provider + core hooks, useEditor/NoteloomEditor, block/inline
// registries); the long tail of block-specific commands/components is
// typed more loosely (real parameter counts, permissive value types) so
// every export still gets *something* useful rather than `any`. No `.js`/
// `.jsx` source was changed to produce this file.

import type { ComponentType, ReactNode, ReactElement, CSSProperties, RefObject, ClipboardEvent } from 'react';

// ---------------------------------------------------------------------------
// Document shape
// ---------------------------------------------------------------------------

export interface Block {
  id: string;
  type: string;
  parentId: string | null;
  contentIds: string[];
  props: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Run {
  id: string;
  type: string;
  value?: string;
  marks?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FieldType {
  id: string;
  label: string;
  placeholder?: string;
  variant?: string;
  options: Array<{ value: string; label: string; color?: string }>;
  [key: string]: unknown;
}

export interface DocumentJSON {
  rootId: string;
  blocks: Block[];
  runs: Run[];
  fieldTypes?: FieldType[];
}

export type Operation = { type: string; [key: string]: unknown };
export type OperationInverse = Operation;

/** Opaque envelope shape carried between EditorStore.applyRemoteOperation and CollabSession/syncProtocol — kind-discriminated, see EditorStore.js. */
export type RemoteOperationEnvelope = { kind: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// store/operations.js
// ---------------------------------------------------------------------------

export const OP: {
  INSERT_BLOCK: 'insertBlock';
  REMOVE_BLOCK: 'removeBlock';
  MOVE_BLOCK: 'moveBlock';
  CHANGE_BLOCK_TYPE: 'changeBlockType';
  UPDATE_BLOCK_PROPS: 'updateBlockProps';
  UPDATE_RUN: 'updateRun';
  SET_BLOCK_CONTENT_IDS: 'setBlockContentIds';
  REPLACE_RUN_SPAN: 'replaceRunSpan';
  SET_BLOCK_RUNS: 'setBlockRuns';
  ADD_FIELD_TYPE: 'addFieldType';
  UPDATE_FIELD_TYPE: 'updateFieldType';
  REMOVE_FIELD_TYPE: 'removeFieldType';
};

export namespace operations {
  export function insertBlock(block: Block, parentId: string, index: number, subtree?: { blocks: Block[]; runs: Run[] }): Operation;
  export function removeBlock(id: string): Operation;
  export function moveBlock(id: string, toParentId: string, toIndex: number): Operation;
  export function updateBlockProps(id: string, patch: Record<string, unknown>): Operation;
  export function changeBlockType(id: string, blockType: string, props: Record<string, unknown>): Operation;
  export function updateRun(id: string, patch: Record<string, unknown>): Operation;
  export function setBlockContentIds(blockId: string, contentIds: string[]): Operation;
  export function replaceRunSpan(blockId: string, oldRunIds: string[], newRuns: Run[]): Operation;
  export function setBlockRuns(blockId: string, runs: Run[]): Operation;
  export function addFieldType(fieldType: FieldType): Operation;
  export function updateFieldType(id: string, patch: Partial<FieldType>): Operation;
  export function removeFieldType(id: string): Operation;
}

// ---------------------------------------------------------------------------
// store/EditorStore.js, store/history.js
// ---------------------------------------------------------------------------

export class EditorStore {
  constructor(doc?: DocumentJSON);
  blocks: Map<string, Block>;
  runs: Map<string, Run>;
  rootId: string | null;
  fieldTypes: Map<string, FieldType>;

  getBlock(id: string): Block | undefined;
  getRun(id: string): Run | undefined;
  getFieldTypes(): FieldType[];
  getFieldType(id: string): FieldType | undefined;
  getRootId(): string | null;
  subscribe(id: string, listener: () => void): () => void;
  subscribeAll(listener: () => void): () => void;
  applyOperation(op: Operation): OperationInverse;
  applyOperations(ops: Operation[]): OperationInverse[];
  getLastEnvelope(): RemoteOperationEnvelope | null;
  applyRemoteOperation(envelope: RemoteOperationEnvelope): void;
  getTombstoneCount(): number;
  pruneTombstones(options?: { maxAgeMs?: number; now?: number }): number;
  toJSON(): DocumentJSON;
}

export interface HistoryOptions {
  idleMs?: number;
  trackChanges?: boolean;
  maxChangeLogSize?: number;
}

export interface HistoryLogEntry {
  opType: string;
  id: string | undefined;
  actorId: string | null;
  timestamp: number;
}

export interface ChangeLogEntry extends HistoryLogEntry {
  before?: unknown;
  after?: unknown;
}

export interface OperationMeta {
  actorId?: string | null;
  timestamp?: number;
}

/** Wraps an EditorStore with undo/redo — exposes the same read surface, so anything typed against `EditorStore` also accepts a `History` instance. */
export class History {
  constructor(store: EditorStore, options?: HistoryOptions);
  store: EditorStore;

  getBlock(id: string): Block | undefined;
  getRun(id: string): Run | undefined;
  getRootId(): string | null;
  getFieldTypes(): FieldType[];
  getFieldType(id: string): FieldType | undefined;
  subscribe(id: string, listener: () => void): () => void;
  subscribeAll(listener: () => void): () => void;
  getTombstoneCount(): number;
  pruneTombstones(options?: { maxAgeMs?: number; now?: number }): number;
  toJSON(): DocumentJSON;

  applyOperation(op: Operation, meta?: OperationMeta): OperationInverse;
  applyOperations(ops: Operation[], meta?: OperationMeta): OperationInverse[];
  performBatch(ops: Operation[], meta?: OperationMeta): void;
  perform(op: Operation, meta?: OperationMeta): OperationInverse;
  flush(): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  getPendingSelection(): { runId: string; offset: number } | null;
  getPendingAffectedBlockIds(): string[];
  getUndoRedoSnapshot(): { canUndo: boolean; canRedo: boolean };
  getHistoryLog(): HistoryLogEntry[];
  getChangeLog(): ChangeLogEntry[];
  subscribeToHistory(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------
// crdt/
// ---------------------------------------------------------------------------

export interface HlcTimestamp {
  physical: number;
  logical: number;
  peerId: string;
}

export class HLC {
  constructor(peerId: string);
  tick(): HlcTimestamp;
  receive(remote: HlcTimestamp): HlcTimestamp;
  static compare(a: HlcTimestamp, b: HlcTimestamp): number;
}

export function genPeerId(): string;

export interface ListCrdtSlot {
  id: string;
  originId: string | null;
  clock: HlcTimestamp;
  deletedClock?: HlcTimestamp | null;
  [key: string]: unknown;
}

export class ListCrdtState {
  static fromArray(ids: string[], options?: { peerId?: string }): ListCrdtState;
  has(id: string): boolean;
  getSlot(id: string): ListCrdtSlot | undefined;
  isDeleted(id: string): boolean;
  insert(id: string, afterId: string | null, clock: HlcTimestamp, peerId: string): ListCrdtSlot;
  delete(id: string, clock: HlcTimestamp): void;
  restore(id: string): void;
  move(id: string, afterId: string | null, clock: HlcTimestamp, peerId: string): void;
  merge(remoteSlots: ListCrdtSlot[]): void;
  toSlotArray(): ListCrdtSlot[];
  toArray(): string[];
  tombstoneCount(): number;
  pruneTombstones(beforeClock: HlcTimestamp): number;
}

export class FieldClockRegistry {
  shouldApply(key: string, clock: HlcTimestamp): boolean;
  record(key: string, clock: HlcTimestamp): void;
}

export function createPeriodicTombstoneGC(options: {
  store: EditorStore | History;
  intervalMs?: number;
  maxAgeMs?: number;
  onPrune?: (prunedCount: number) => void;
  onError?: (error: unknown) => void;
}): { stop: () => void };

// ---------------------------------------------------------------------------
// sync/
// ---------------------------------------------------------------------------

export interface SignalingChannel {
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
  close(): void;
}

export const MESSAGE_TYPE: {
  HELLO: string;
  OP: string;
  SYNC_REQUEST: string;
  SYNC_RESPONSE: string;
  PRESENCE: string;
};

export function encodeMessage(message: unknown): string;
export function decodeMessage(raw: string): unknown;

export class PeerConnection {
  constructor(options: { peerConnection: RTCPeerConnection; dataChannel?: RTCDataChannel; onMessage?: (message: unknown) => void });
  send(message: unknown): void;
  close(): void;
}

export class CollabSession {
  constructor(options: { history: History | EditorStore; signaling: SignalingChannel; presenceThrottleMs?: number });
  connect(remotePeerId: string, options: { initiator: boolean }): void;
  disconnect(remotePeerId: string): void;
  destroy(): void;
  setLocalPresence(data: Record<string, unknown>): void;
  getPresence(): Map<string, Record<string, unknown>>;
  onPresenceChange(callback: (presence: Map<string, Record<string, unknown>>) => void): () => void;
}

export function createWebSocketSignaling(options: {
  url: string;
  roomId: string;
  peerId: string;
  WebSocketImpl?: typeof WebSocket;
}): SignalingChannel;

// ---------------------------------------------------------------------------
// persistence/
// ---------------------------------------------------------------------------

export function savePersistedDocument(docId: string, doc: DocumentJSON): Promise<void>;
export function loadPersistedDocument(docId: string): Promise<DocumentJSON | undefined>;
export function deletePersistedDocument(docId: string): Promise<void>;
export function listPersistedDocumentIds(): Promise<string[]>;

export function createAutoPersistence(options: {
  store: History | EditorStore;
  docId: string;
  debounceMs?: number;
  onError?: (error: unknown) => void;
}): { stop: () => void; flush: () => void };

// ---------------------------------------------------------------------------
// registry/, blocks/, inlineTypes/
// ---------------------------------------------------------------------------

export interface BlockTypeEntry {
  component: ComponentType<{ id: string }>;
  isLeaf: boolean;
  defaultProps?: Record<string, unknown>;
  [key: string]: unknown;
}

export class BlockRegistry {
  register(type: string, entry: BlockTypeEntry): void;
  get(type: string): BlockTypeEntry | undefined;
  isLeaf(type: string): boolean;
  listSlashCommands(): unknown[];
  listHtmlMatchers(): BlockTypeEntry[];
}

export function createBlockRegistry(): BlockRegistry;

export interface InlineTypeEntry {
  component: ComponentType<{ id: string }>;
  isAtomic: true;
  [key: string]: unknown;
}

export class InlineRegistry {
  register(type: string, entry: InlineTypeEntry): void;
  unregister(type: string): void;
  get(type: string): InlineTypeEntry | undefined;
  listHtmlMatchers(): InlineTypeEntry[];
  listSlashCommands(): unknown[];
  listAtCommands(): unknown[];
}

export function createInlineRegistry(): InlineRegistry;

/** Opaque block-type definition value, passed to registerBlocks — see the individual `xBlockType` exports below. */
export type BlockTypeDefinition = BlockTypeEntry;
/** Opaque inline-type definition value, passed to registerInlineTypes — see the individual `xInlineType` exports below. */
export type InlineTypeDefinition = InlineTypeEntry;

export function registerBuiltInBlocks(registry: BlockRegistry): void;
export function registerBlocks(registry: BlockRegistry, types: Record<string, BlockTypeDefinition>): void;
export const TABLE_BLOCKS: Record<string, BlockTypeDefinition>;
export const LAYOUT_BLOCKS: Record<string, BlockTypeDefinition>;

export const paragraphBlockType: BlockTypeDefinition;
export const headingBlockType: BlockTypeDefinition;
export const listItemBlockType: BlockTypeDefinition;
export const tableBlockType: BlockTypeDefinition;
export const tableRowBlockType: BlockTypeDefinition;
export const tableCellBlockType: BlockTypeDefinition;
export const layoutBlockType: BlockTypeDefinition;
export const layoutColumnBlockType: BlockTypeDefinition;
export const dividerBlockType: BlockTypeDefinition;
export const calloutBlockType: BlockTypeDefinition;
export const blockquoteBlockType: BlockTypeDefinition;
export const codeBlockType: BlockTypeDefinition;
export const toggleHeadingBlockType: BlockTypeDefinition;
export const buttonBlockType: BlockTypeDefinition;
export const embedBlockType: BlockTypeDefinition;

export function registerBuiltInInlineTypes(inlineRegistry: InlineRegistry): void;
export function registerInlineTypes(inlineRegistry: InlineRegistry, types: Record<string, InlineTypeDefinition>): void;
export const TABLE_SELECT_INLINE_TYPES: Record<string, InlineTypeDefinition>;

export const selectInlineType: InlineTypeDefinition;
export const dateInlineType: InlineTypeDefinition;
export const checkboxInlineType: InlineTypeDefinition;
export const tableSelectInlineType: InlineTypeDefinition;
export const emojiInlineType: InlineTypeDefinition;

// ---------------------------------------------------------------------------
// react/ — provider, core hooks
// ---------------------------------------------------------------------------

export interface EditorProviderProps {
  store: EditorStore | History;
  registry: BlockRegistry;
  inlineRegistry?: InlineRegistry | null;
  history?: History | null;
  className?: string;
  style?: CSSProperties;
  theme?: 'default' | 'none';
  getBlockClassName?: (block: Block) => string | undefined;
  children?: ReactNode;
}

export function EditorProvider(props: EditorProviderProps): ReactElement;
export function useEditorStore(): EditorStore | History;
export function useBlockRegistry(): BlockRegistry;
export function useInlineRegistry(): InlineRegistry | null;
export function useWholeDocumentSelection(): [boolean, (value: boolean) => void];
export function useBlockRangeSelection(): [string[], (ids: string[]) => void];
export function useSelectedBlock(): [string | null, (id: string | null) => void];
export function usePreviewMode(): [boolean, (value: boolean) => void];
export function useFieldTypeEditor(): {
  editingFieldTypeId: string | null;
  openFieldTypeEditor: (id: string | null) => void;
  closeFieldTypeEditor: () => void;
};
export function useBlockClassName(baseClassName: string | undefined, block: Block): string | undefined;

export function injectDefaultStyles(): void;

export function useBlock(id: string): Block | undefined;
export function useRun(id: string): Run | undefined;
export function useFieldTypes(): FieldType[];

export interface UseHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  getHistoryLog: () => HistoryLogEntry[];
}

export function useHistory(): UseHistoryResult | null;

export function usePersistedDocument(options: {
  store: EditorStore | History;
  docId: string;
  debounceMs?: number;
  onError?: (error: unknown) => void;
}): { isLoaded: boolean };

export function usePresence(session: CollabSession | null | undefined): Map<string, Record<string, unknown>>;

export function useServiceWorkerUpdate(): { updateAvailable: boolean; applyUpdate: () => void };

export function useVoiceTyping(options?: Record<string, unknown>): Record<string, unknown>;
export const VoicePermissionModal: ComponentType<Record<string, unknown>>;
export const VoiceListeningIndicator: ComponentType<Record<string, unknown>>;
export function useCaretRect(...args: unknown[]): unknown;
export function listVoiceCommands(): Array<{ phrase: string; description: string }>;

export function useBlockChildren(parentId: string): string[];

export interface ClipboardHandlers {
  onCopy: (event: ClipboardEvent<HTMLElement>) => void;
  onCut: (event: ClipboardEvent<HTMLElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
}

export function useClipboardHandlers(): ClipboardHandlers;
export function useEditorKeyboardShortcuts(containerRef: RefObject<HTMLElement | null>): void;

export const BlockRenderer: ComponentType<{ id: string }>;
export const BlockErrorBoundary: ComponentType<{ children?: ReactNode }>;
export const BlockChildren: ComponentType<{ parentId: string; isTopLevel?: boolean }>;
export const BlockGutterRow: ComponentType<Record<string, unknown>>;
export const BlockRangeActionMenu: ComponentType<Record<string, unknown>>;
export function useBlockRangeDrag(containerRef: RefObject<HTMLElement | null>): void;
export function useCoarsePointer(): boolean;
export function useVirtualKeyboardInset(): number;
export const MobileActionBar: ComponentType<{ containerRef: RefObject<HTMLElement | null> }>;
export const MobileBlockPickerSheet: ComponentType<Record<string, unknown>>;
export const MobileBlockOptionsSheet: ComponentType<Record<string, unknown>>;
export const EditableBlockContent: ComponentType<Record<string, unknown>>;
export const Modal: ComponentType<{ isOpen?: boolean; onClose?: () => void; children?: ReactNode; [key: string]: unknown }>;
export const Select: ComponentType<Record<string, unknown>>;
export const EditorTrailingSpace: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// clipboard/
// ---------------------------------------------------------------------------

export const APP_MIME: string;
export function serializeBlockRange(...args: unknown[]): unknown;
export function remapSubtreeIds(...args: unknown[]): unknown;
export function deserializeClipboard(...args: unknown[]): unknown;
export function walkDomToBlocks(...args: unknown[]): unknown;
export function textToParagraphs(...args: unknown[]): unknown;
export function exportDocumentJSON(store: EditorStore | History): unknown;
export function exportDocumentHTML(store: EditorStore | History, registry: BlockRegistry): string;
export function exportDocumentText(store: EditorStore | History, registry: BlockRegistry): string;
export function exportDocumentSimpleJSON(store: EditorStore | History, registry: BlockRegistry, inlineRegistry: InlineRegistry): unknown;
export function importDocumentSimpleJSON(json: unknown, registry: BlockRegistry, inlineRegistry: InlineRegistry): DocumentJSON;
export const DocumentExportButton: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// commands/
// ---------------------------------------------------------------------------

export interface CommandMenuTriggerState {
  isOpen: boolean;
  rect: { top: number; left: number; bottom: number; right: number } | null;
  commands: unknown[];
  runId: string | null;
  selectCommand: (command: unknown) => void;
  close: () => void;
}

export interface SlashMenuProps {
  isOpen: boolean;
  rect: CommandMenuTriggerState['rect'];
  commands: unknown[];
  runId: string | null;
  onSelect: (command: unknown) => void;
  onClose: () => void;
  menuId?: string;
  ariaLabel?: string;
}

export const SlashMenu: ComponentType<SlashMenuProps>;
export function useSlashMenuTrigger(containerRef: RefObject<HTMLElement | null>): CommandMenuTriggerState;
export function useEmojiMenuTrigger(containerRef: RefObject<HTMLElement | null>): CommandMenuTriggerState;
export function useAtMenuTrigger(containerRef: RefObject<HTMLElement | null>): CommandMenuTriggerState;

export interface FloatingToolbarProps {
  isOpen: boolean;
  rect: CommandMenuTriggerState['rect'];
  kind: string | null;
  selection: unknown;
  crossSelection: unknown;
  marks: Record<string, unknown>;
  store: EditorStore | History;
}

export const FloatingToolbar: ComponentType<FloatingToolbarProps>;
export function useFloatingToolbarTrigger(containerRef: RefObject<HTMLElement | null>): {
  isOpen: boolean;
  rect: CommandMenuTriggerState['rect'];
  kind: string | null;
  selection: unknown;
  crossSelection: unknown;
  marks: Record<string, unknown>;
};
export function useTextFormattingActions(...args: unknown[]): unknown;

// ---------------------------------------------------------------------------
// blocks/table/
// ---------------------------------------------------------------------------

export function insertRowAfter(...args: unknown[]): unknown;
export function deleteRow(...args: unknown[]): unknown;
export function insertColumnAfter(...args: unknown[]): unknown;
export function deleteColumn(...args: unknown[]): unknown;
export function renameColumn(...args: unknown[]): unknown;
export function setColumnType(...args: unknown[]): unknown;
export function setColumnOptions(...args: unknown[]): unknown;
export function setColumnWidth(...args: unknown[]): unknown;
export function resolveColumns(...args: unknown[]): unknown;
export function createDefaultColumns(...args: unknown[]): unknown;
export function createCellForColumn(...args: unknown[]): unknown;
export function convertRunToType(...args: unknown[]): unknown;
export function blankRunForType(...args: unknown[]): unknown;
export const COLUMN_TYPES: Record<string, string>;
export const DEFAULT_COLUMN_TYPE: string;
export const DEFAULT_COLUMN_WIDTH: number;
export const MIN_COLUMN_WIDTH: number;
export const TableHeaderRow: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// inline/, react/ selection & shared block actions
// ---------------------------------------------------------------------------

export function toggleMarkOnRunRange(...args: unknown[]): unknown;
export function toggleMarkOverSelection(...args: unknown[]): unknown;
export function toggleMarkOverBlockRange(...args: unknown[]): unknown;
export function setMarksOverSelection(...args: unknown[]): unknown;
export function setMarksOverBlockRange(...args: unknown[]): unknown;
export function getMarksSummaryOverSelection(...args: unknown[]): Record<string, unknown>;
export function getMarksSummaryOverBlockRange(...args: unknown[]): Record<string, unknown>;
export function deleteRunRangeInBlock(...args: unknown[]): unknown;
export function deleteOverBlockRange(...args: unknown[]): unknown;
export function deleteEntireDocument(...args: unknown[]): unknown;
export function resolveRunSelection(...args: unknown[]): unknown;
export function resolveMultiRunSelection(...args: unknown[]): unknown;
export function resolveCrossBlockSelection(...args: unknown[]): unknown;
export function resolveCollapsedCaret(...args: unknown[]): unknown;
export function isEntireBlockSelected(...args: unknown[]): boolean;
export function focusRunEnd(runId: string): void;
export function focusRunStart(runId: string): void;
export function focusRunAtOffset(runId: string, offset: number): void;
export function ensureRootNonEmpty(store: EditorStore | History): void;
export function duplicateBlock(...args: unknown[]): unknown;
export function moveBlockUp(...args: unknown[]): unknown;
export function moveBlockDown(...args: unknown[]): unknown;
export function deleteBlockAndFocusSibling(...args: unknown[]): unknown;
export function deleteBlockRange(...args: unknown[]): unknown;
export function moveBlockRangeUp(...args: unknown[]): unknown;
export function moveBlockRangeDown(...args: unknown[]): unknown;
export function isEntireBlockRangeHidden(...args: unknown[]): boolean;
export function setBlockRangeHidden(...args: unknown[]): unknown;
export function reorderBlockRangeFromStore(...args: unknown[]): unknown;
export function copyBlockRangeToClipboard(...args: unknown[]): unknown;

// ---------------------------------------------------------------------------
// inlineTypes/customSelect/ — user-authored custom field types
// ---------------------------------------------------------------------------

export function createSelectFieldType(options: Record<string, unknown>): InlineTypeDefinition;
export function registerStoredFieldTypes(inlineRegistry: InlineRegistry, fieldTypes: FieldType[]): void;
export function useRegisterFieldTypes(inlineRegistry: InlineRegistry, fieldTypes: FieldType[]): void;
export const FieldTypeEditorModal: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// react/useEditor.js, react/NoteloomEditor.jsx — the simplified entry point
// ---------------------------------------------------------------------------

export interface UseEditorOptions {
  /** Starting document; defaults to one empty paragraph. */
  doc?: DocumentJSON;
  /** true (default): store is undo/redo-aware (a History instance). false: a plain EditorStore. */
  history?: boolean;
  /** Replaces registerBuiltInBlocks for an opt-in subset of block types. */
  registerBlocks?: (registry: BlockRegistry) => void;
  /** Replaces registerBuiltInInlineTypes for an opt-in subset of inline types. */
  registerInlineTypes?: (inlineRegistry: InlineRegistry) => void;
}

export interface UseEditorResult {
  store: History | EditorStore;
  registry: BlockRegistry;
  inlineRegistry: InlineRegistry;
}

/** The one-call path to a working editor — see the README's Quick start. */
export function useEditor(options?: UseEditorOptions): UseEditorResult;

export interface NoteloomEditorProps {
  editor: UseEditorResult;
  className?: string;
  style?: CSSProperties;
  theme?: 'default' | 'none';
  getBlockClassName?: (block: Block) => string | undefined;
  children?: ReactNode;
}

/** Renders the object useEditor() returned, with every built-in interaction wired up. */
export function NoteloomEditor(props: NoteloomEditorProps): ReactElement;
