// Hand-written type declarations for noteloom's public API (src/index.js).
// Covers the primary surface in real detail (store/CRDT/sync/persistence,
// the React provider + core hooks, useEditor/NoteloomEditor, block/inline
// registries); the long tail of block-specific commands/components is
// typed more loosely (real parameter counts, permissive value types) so
// every export still gets *something* useful rather than `any`. No `.js`/
// `.jsx` source was changed to produce this file.

import type {
  ComponentType,
  ReactNode,
  ReactElement,
  CSSProperties,
  RefObject,
  ClipboardEvent,
} from 'react';

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

export interface CommentMessage {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface CommentThread {
  id: string;
  blockId: string;
  /** Creation-time hint only, not re-validated after later formatting edits -- see the README's documented limitation. */
  anchorRunIds: string[];
  resolved: boolean;
  messages: CommentMessage[];
}

export interface DocumentJSON {
  rootId: string;
  blocks: Block[];
  runs: Run[];
  fieldTypes?: FieldType[];
  comments?: CommentThread[];
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
  ADD_COMMENT_THREAD: 'addCommentThread';
  REMOVE_COMMENT_THREAD: 'removeCommentThread';
  ADD_COMMENT_REPLY: 'addCommentReply';
  REMOVE_COMMENT_REPLY: 'removeCommentReply';
  RESOLVE_COMMENT: 'resolveComment';
};

export namespace operations {
  export function insertBlock(
    block: Block,
    parentId: string,
    index: number,
    subtree?: { blocks: Block[]; runs: Run[] },
  ): Operation;
  export function removeBlock(id: string): Operation;
  export function moveBlock(id: string, toParentId: string, toIndex: number): Operation;
  export function updateBlockProps(id: string, patch: Record<string, unknown>): Operation;
  export function changeBlockType(
    id: string,
    blockType: string,
    props: Record<string, unknown>,
  ): Operation;
  export function updateRun(id: string, patch: Record<string, unknown>): Operation;
  export function setBlockContentIds(blockId: string, contentIds: string[]): Operation;
  export function replaceRunSpan(blockId: string, oldRunIds: string[], newRuns: Run[]): Operation;
  export function setBlockRuns(blockId: string, runs: Run[]): Operation;
  export function addFieldType(fieldType: FieldType): Operation;
  export function updateFieldType(id: string, patch: Partial<FieldType>): Operation;
  export function removeFieldType(id: string): Operation;
  export function addCommentThread(thread: CommentThread): Operation;
  export function removeCommentThread(commentId: string): Operation;
  export function addCommentReply(commentId: string, message: CommentMessage): Operation;
  export function removeCommentReply(commentId: string, messageId: string): Operation;
  export function resolveComment(commentId: string, resolved: boolean): Operation;
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
  comments: Map<string, CommentThread>;

  getBlock(id: string): Block | undefined;
  getRun(id: string): Run | undefined;
  getFieldTypes(): FieldType[];
  getFieldType(id: string): FieldType | undefined;
  getComments(): CommentThread[];
  getComment(id: string): CommentThread | undefined;
  /** Every run id in the whole document, regardless of reachability from the root -- see removeCommentMarkEverywhere. */
  getAllRunIds(): string[];
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
  /** Stamped as every edit's actorId when a perform/performBatch call doesn't pass its own -- see useEditor's `currentUserId`. */
  defaultActorId?: string | null;
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
  defaultActorId: string | null;
  setDefaultActorId(actorId: string | null): void;

  getBlock(id: string): Block | undefined;
  getRun(id: string): Run | undefined;
  getRootId(): string | null;
  getFieldTypes(): FieldType[];
  getFieldType(id: string): FieldType | undefined;
  getComments(): CommentThread[];
  getComment(id: string): CommentThread | undefined;
  getAllRunIds(): string[];
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
  constructor(options: {
    peerConnection: RTCPeerConnection;
    dataChannel?: RTCDataChannel;
    onMessage?: (message: unknown) => void;
  });
  send(message: unknown): void;
  close(): void;
}

export class CollabSession {
  constructor(options: {
    history: History | EditorStore;
    signaling: SignalingChannel;
    presenceThrottleMs?: number;
  });
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
}): { stop: () => void; flush: () => Promise<void> };

// ---------------------------------------------------------------------------
// templates/ (+ the template half of persistence/)
// ---------------------------------------------------------------------------

/** One captured block-template root — see captureBlockTemplate. */
export interface BlockTemplate {
  roots: CapturedSubtree[];
}

export interface StoredTemplate {
  id: string;
  scope: 'document' | 'block';
  name: string;
  description?: string;
  /** A full DocumentJSON for scope 'document', or a BlockTemplate ({ roots }) for scope 'block'. */
  doc: DocumentJSON | BlockTemplate;
}

export function saveTemplate(template: StoredTemplate): Promise<void>;
export function loadTemplate(id: string): Promise<StoredTemplate | null>;
export function deleteTemplate(id: string): Promise<void>;
export function listTemplates(): Promise<StoredTemplate[]>;

export function captureBlockTemplate(
  store: EditorStore | History,
  blockIds: string[],
): BlockTemplate;
export function insertBlockTemplate(
  store: EditorStore | History,
  template: BlockTemplate,
  position: { parentId: string; index: number },
): void;
/** Wholesale-replaces an already-mounted editor's content with a document template. To start a NEW editor from one instead, just pass it as useEditor({ doc }). */
export function applyDocumentTemplate(store: EditorStore | History, doc: DocumentJSON): void;

export interface BlockTemplateDefinition {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  keywords?: string[];
  roots: CapturedSubtree[];
}

/** Registers block templates as slash commands, discoverable/insertable via "/" alongside every built-in block — no SlashMenu/BlockRegistry changes needed. */
export function registerBlockTemplates(
  registry: BlockRegistry,
  templates: BlockTemplateDefinition[],
): void;

export function useTemplates(options?: { scope?: 'document' | 'block' }): {
  templates: StoredTemplate[];
  isLoaded: boolean;
  refresh: () => Promise<void>;
};

export interface TemplatePickerProps {
  templates: StoredTemplate[];
  onSelect: (template: StoredTemplate) => void;
  emptyLabel?: string;
}

export const TemplatePicker: ComponentType<TemplatePickerProps>;

// ---------------------------------------------------------------------------
// versions/ (+ the version half of persistence/)
// ---------------------------------------------------------------------------

export interface DocumentVersion {
  id: string;
  docId: string;
  timestamp: number;
  /** Whoever made the most recent edit in this version's window -- read from History's defaultActorId, null if never configured. */
  authorId?: string | null;
  /** Every distinct actorId that contributed to this version's window. */
  authorIds?: string[];
  /** Lightweight auto-generated description (e.g. "3 blocks changed") -- not a full diff. */
  summary?: string;
  /** Only ever set by renaming a version yourself -- nothing in this package's automatic capture sets it. */
  label?: string;
  doc: DocumentJSON;
}

export function saveDocumentVersion(version: DocumentVersion): Promise<void>;
export function loadDocumentVersion(id: string): Promise<DocumentVersion | null>;
export function deleteDocumentVersion(id: string): Promise<void>;
/** All versions saved for docId, newest first. */
export function listDocumentVersions(docId: string): Promise<DocumentVersion[]>;

/**
 * Automatic, Google Docs-style version history -- no "name it and save"
 * step. `store` must be a History instance (needs getHistoryLog()/
 * subscribeToHistory()). Saves one snapshot after each burst of edits
 * settles (idleMs of inactivity), attributed to whoever made them.
 */
export function createAutoVersionHistory(options: {
  store: History;
  docId: string;
  /** Inactivity gap that closes a version's window. Default 5 minutes. */
  idleMs?: number;
  maxVersions?: number;
  onSnapshot?: (version: DocumentVersion) => void;
  onError?: (error: unknown) => void;
}): { stop: () => void; flush: () => Promise<void> };

export function useDocumentVersions(docId: string | null | undefined): {
  versions: DocumentVersion[];
  isLoaded: boolean;
  refresh: () => Promise<void>;
};

/**
 * Google Docs "show changes"-style HTML diff of `nextDoc` against `prevDoc`
 * (pass null/undefined for prevDoc to mark everything as newly added) --
 * word-level insertions/deletions wrapped in `.be-version-diff-added`/
 * `.be-version-diff-removed` spans. Used internally by `<VersionHistory>`'s
 * "Changes" tab; exported for building a custom version-history UI.
 */
export function diffDocumentsHTML(
  prevDoc: DocumentJSON | null | undefined,
  nextDoc: DocumentJSON,
): string;

export interface VersionHistoryProps {
  docId: string;
  idleMs?: number;
  maxVersions?: number;
}

/** Self-contained "Version history" button + drawer (list/preview/restore) -- also owns the automatic capture (createAutoVersionHistory) for as long as it's mounted. `store` (from context) must be a History instance. */
export const VersionHistory: ComponentType<VersionHistoryProps>;

// ---------------------------------------------------------------------------
// comments/
// ---------------------------------------------------------------------------

export interface CommentRange {
  blockId: string;
  startRunId: string;
  startOffset: number;
  endRunId: string;
  endOffset: number;
}

/** Creates a comment thread anchored to `range`, highlighting it and creating the thread as one atomic undo step. Returns the new comment's id. */
export function addComment(
  store: EditorStore | History,
  range: CommentRange,
  message: { authorId: string; text: string },
): string;
/** Appends a reply to an existing thread. Returns the new message's id. */
export function replyToComment(
  store: EditorStore | History,
  commentId: string,
  message: { authorId: string; text: string },
): string;
/** Flips a thread's resolved flag (defaults to true). */
export function resolveComment(
  store: EditorStore | History,
  commentId: string,
  resolved?: boolean,
): void;
/** Removes a thread and strips its highlight from every run that still carries it, as one atomic undo step. */
export function deleteComment(store: EditorStore | History, commentId: string): void;

/** Computes (does not apply) the op that highlights `range` with `commentId` -- for advanced use; addComment already calls this. Returns null for a collapsed/unresolvable range. */
export function addCommentMarkOverRange(
  store: EditorStore | History,
  range: CommentRange,
  commentId: string,
): Operation | null;
/** Computes (does not apply) the ops that strip `commentId` from every run in the document that carries it. */
export function removeCommentMarkEverywhere(
  store: EditorStore | History,
  commentId: string,
): Operation[];

export function useComments(): CommentThread[];

export interface CommentComposerProps {
  /** Renders the composer's own avatar preview -- does not decide who the message is attributed to (the caller still passes authorId to addComment/replyToComment). */
  authorId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  /** Renders a Cancel button when given. */
  onCancel?: () => void;
}

/** An avatar + textarea + send button for composing one comment message -- the shared piece CommentThreadCard's reply flow and FloatingToolbar's built-in Comment composer both use. */
export const CommentComposer: ComponentType<CommentComposerProps>;

export interface CommentAvatarProps {
  authorId?: string;
  size?: number;
}

/** A small colored circle with the author's initials, deterministically generated from authorId -- this package has no profile-picture/identity concept of its own. */
export const CommentAvatar: ComponentType<CommentAvatarProps>;

export interface CommentThreadCardProps {
  store: EditorStore | History;
  thread: CommentThread;
  /** Hides the Reply action when not given -- composing a message needs an author. */
  authorId?: string;
}

/** One comment thread -- messages, then Reply/Resolve/Delete. Shared by CommentPopover (click/hover on highlighted text, mounted automatically) and CommentsPanel. */
export const CommentThreadCard: ComponentType<CommentThreadCardProps>;

export interface CommentsPanelProps {
  authorId?: string;
}

/** The opt-in right-side comments panel (Notion/Google Docs-style) -- see NoteloomEditorProps.showCommentsPanel, or render it yourself anywhere under an EditorProvider for the granular API. */
export const CommentsPanel: ComponentType<CommentsPanelProps>;

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
export function registerBlocks(
  registry: BlockRegistry,
  types: Record<string, BlockTypeDefinition>,
): void;
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
export const canvasBlockType: BlockTypeDefinition;

export function registerBuiltInInlineTypes(inlineRegistry: InlineRegistry): void;
export function registerInlineTypes(
  inlineRegistry: InlineRegistry,
  types: Record<string, InlineTypeDefinition>,
): void;
export const TABLE_SELECT_INLINE_TYPES: Record<string, InlineTypeDefinition>;

export const selectInlineType: InlineTypeDefinition;
export const dateInlineType: InlineTypeDefinition;
export const checkboxInlineType: InlineTypeDefinition;
export const tableSelectInlineType: InlineTypeDefinition;
export const emojiInlineType: InlineTypeDefinition;

// ---------------------------------------------------------------------------
// registry/define.js, starter-kit.js — the defineBlock/defineInline factories
// ---------------------------------------------------------------------------

export interface DefineBlockConfig {
  /** Unique — used as the block `type`. */
  name: string;
  /** React component, receives `{ id }`. */
  component: ComponentType<{ id: string }>;
  /** 'blocks' (default, holds child blocks) | 'runs' | 'void' (both leaves). */
  contentModel?: 'blocks' | 'runs' | 'void';
  /** Escape hatch — set `isLeaf` directly instead of `contentModel`. */
  isLeaf?: boolean;
  defaultProps?: Record<string, unknown>;
  toHTML?: (block: Block, ctx: unknown) => string;
  fromHTML?: (node: unknown, ctx: unknown) => unknown;
  toPlainText?: (block: Block, ctx: unknown) => string;
  toMarkdown?: (block: Block, ctx: unknown) => string;
  slashCommand?: unknown;
  slashCommands?: unknown[];
  [key: string]: unknown;
}

export interface DefineInlineConfig {
  name: string;
  component: ComponentType<{ id: string }>;
  /** Only `true` (the default) is supported today. */
  atomic?: boolean;
  isAtomic?: boolean;
  toHTML?: (run: Run, ctx: unknown) => string;
  fromHTML?: (node: unknown, ctx: unknown) => unknown;
  toPlainText?: (run: Run, ctx: unknown) => string;
  slashCommand?: unknown;
  slashCommands?: unknown[];
  atCommand?: unknown;
  atCommands?: unknown[];
  [key: string]: unknown;
}

/** A `defineBlock()` result — a `BlockRegistry` entry tagged `kind: 'block'`. */
export type BlockDefinition = BlockTypeDefinition & { name: string; kind: 'block' };
/** A `defineInline()` result — an `InlineRegistry` entry tagged `kind: 'inline'`. */
export type InlineDefinition = InlineTypeDefinition & { name: string; kind: 'inline' };
export type Extension = BlockDefinition | InlineDefinition;

export function defineBlock(config: DefineBlockConfig): BlockDefinition;
export function defineInline(config: DefineInlineConfig): InlineDefinition;

/** Registers a flat/nested array of `defineBlock()` / `defineInline()` results onto the given registries. */
export function registerExtensions(
  extensions: ReadonlyArray<Extension | ReadonlyArray<Extension>>,
  registries: { registry?: BlockRegistry; inlineRegistry?: InlineRegistry },
): void;

/** Every built-in block + inline type as an `extensions` array. `exclude` drops types by name. */
export function starterKit(options?: { exclude?: string[] }): Extension[];

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
  /** Current user's id for authoring comments through the built-in comment UI -- see useCommentAuthorId. */
  commentAuthorId?: string;
  /** Whether CodeBlock renders its line-number gutter -- see useShowLineNumbers. */
  showLineNumbers?: boolean;
  /** Sends a picked/dropped EmbedBlock file somewhere real (local disk, S3, any other cloud storage) instead of inlining it as a data: URL -- see useFileUpload's own doc comment for the full contract. */
  uploadFile?: (
    file: File,
    ctx: { kind: 'image' | 'video' | 'audio' | 'file' },
  ) => Promise<{ src: string; name?: string; mimeType?: string }>;
  /** Byte cap for the in-document data: URL fallback ONLY (no effect once uploadFile is configured) -- an oversized file is rejected with a clear error instead of bloating the document. */
  maxFileSize?: number;
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
/** The commentAuthorId passed to EditorProvider/NoteloomEditor, or undefined if not configured -- see NoteloomEditorProps.commentAuthorId. */
export function useCommentAuthorId(): string | undefined;
/** Whether CodeBlock should render its line-number gutter -- see EditorProviderProps.showLineNumbers. */
export function useShowLineNumbers(): boolean;
/** `{ uploadFile, maxFileSize }` from EditorProvider -- see EditorProviderProps and useFileUpload's own doc comment for the full contract. */
export function useFileUpload(): {
  uploadFile?: (
    file: File,
    ctx: { kind: 'image' | 'video' | 'audio' | 'file' },
  ) => Promise<{ src: string; name?: string; mimeType?: string }>;
  maxFileSize?: number;
};
export function useFieldTypeEditor(): {
  editingFieldTypeId: string | null;
  openFieldTypeEditor: (id: string | null) => void;
  closeFieldTypeEditor: () => void;
};
export function useBlockClassName(
  baseClassName: string | undefined,
  block: Block,
): string | undefined;

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
  /** Wires Ctrl/Cmd+S to save() and blocks the browser's own save-page dialog. Default true. */
  saveShortcut?: boolean;
  /** Fires after every save() completes (shortcut-triggered or manual). */
  onSave?: () => void;
}): { isLoaded: boolean; save: () => Promise<void> };

export function usePresence(
  session: CollabSession | null | undefined,
): Map<string, Record<string, unknown>>;

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
export const Modal: ComponentType<{
  isOpen?: boolean;
  onClose?: () => void;
  children?: ReactNode;
  [key: string]: unknown;
}>;
export const Select: ComponentType<Record<string, unknown>>;
export const EditorTrailingSpace: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// clipboard/
// ---------------------------------------------------------------------------

export interface CapturedSubtree {
  rootId: string;
  blocks: Block[];
  runs: Run[];
}

export interface RemappedSubtree {
  block: Block;
  runs: Run[];
  subtreeBlocks: Block[];
}

export const APP_MIME: string;
export function serializeBlockRange(
  store: EditorStore | History,
  registry: BlockRegistry,
  blockIds: string[],
  inlineRegistry?: InlineRegistry,
): { html: string; text: string; json: string };
/** Read-only capture of one block + its descendants, with original ids intact — see also captureBlockTemplate for capturing several sibling roots at once. */
export function captureSubtree(store: EditorStore | History, rootId: string): CapturedSubtree;
/** Gives a captured subtree fresh ids, ready to insert elsewhere without colliding with existing content. */
export function remapSubtreeIds(captured: CapturedSubtree): RemappedSubtree;
export function deserializeClipboard(...args: unknown[]): unknown;
export function walkDomToBlocks(...args: unknown[]): unknown;
export function textToParagraphs(...args: unknown[]): unknown;
/** Returns a JSON *string* (pretty-printed by default) — parse it (`JSON.parse`) to get back a plain `{ version, rootId, blocks, runs }` object usable as `useEditor({ doc })`. */
export function exportDocumentJSON(
  store: EditorStore | History,
  options?: { pretty?: boolean },
): string;
export function exportDocumentHTML(store: EditorStore | History, registry: BlockRegistry): string;
export function exportDocumentText(store: EditorStore | History, registry: BlockRegistry): string;
export function exportDocumentMarkdown(
  store: EditorStore | History,
  registry: BlockRegistry,
  inlineRegistry?: InlineRegistry,
): string;
export function exportDocumentWordHTML(
  store: EditorStore | History,
  registry: BlockRegistry,
  inlineRegistry?: InlineRegistry,
): string;
export function exportDocumentSimpleJSON(
  store: EditorStore | History,
  registry: BlockRegistry,
  inlineRegistry: InlineRegistry,
): unknown;
export function importDocumentSimpleJSON(
  json: unknown,
  registry: BlockRegistry,
  inlineRegistry: InlineRegistry,
): DocumentJSON;
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
export function useSlashMenuTrigger(
  containerRef: RefObject<HTMLElement | null>,
): CommandMenuTriggerState;
export function useEmojiMenuTrigger(
  containerRef: RefObject<HTMLElement | null>,
): CommandMenuTriggerState;
export function useAtMenuTrigger(
  containerRef: RefObject<HTMLElement | null>,
): CommandMenuTriggerState;

export interface FloatingToolbarProps {
  isOpen: boolean;
  rect: CommandMenuTriggerState['rect'];
  kind: string | null;
  selection: unknown;
  crossSelection: unknown;
  marks: Record<string, unknown>;
  store: EditorStore | History;
  /** Adds a Comment button (same-block selections only) that calls this with the CommentRange under the current selection. Takes priority over commentAuthorId's built-in composer when both are given. */
  onComment?: (range: CommentRange) => void;
  /** Adds a Comment button using a built-in inline composer (addComment(store, range, {authorId: commentAuthorId, text})) instead of onComment -- see NoteloomEditorProps.commentAuthorId. */
  commentAuthorId?: string;
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
export function sortTableByColumn(...args: unknown[]): unknown;
export function setColumnAggregate(...args: unknown[]): unknown;
export function computeColumnAggregate(...args: unknown[]): unknown;
export function formatAggregateValue(value: number | null): string;
export const AGGREGATE_TYPES: string[];
export const AGGREGATE_LABELS: Record<string, string>;
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
export function registerStoredFieldTypes(
  inlineRegistry: InlineRegistry,
  fieldTypes: FieldType[],
): void;
export function useRegisterFieldTypes(
  inlineRegistry: InlineRegistry,
  fieldTypes: FieldType[],
): void;
export const FieldTypeEditorModal: ComponentType<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// react/useEditor.js, react/NoteloomEditor.jsx — the simplified entry point
// ---------------------------------------------------------------------------

export interface UseEditorOptions {
  /** Starting document; defaults to one empty paragraph. */
  doc?: DocumentJSON;
  /** true (default): store is undo/redo-aware (a History instance). false: a plain EditorStore. */
  history?: boolean;
  /** Stamped as every edit's actorId (History's defaultActorId) -- used by createAutoVersionHistory/VersionHistory for "who changed this", with no separate identity plumbing needed. Ignored when history: false. */
  currentUserId?: string | null;
  /** Recommended: an array of `defineBlock()` / `defineInline()` results (nesting allowed), e.g. `[...starterKit(), myBlock]`. Passing it turns off automatic built-in registration; `registerBlocks`/`registerInlineTypes`, if also given, still run afterward. */
  extensions?: ReadonlyArray<Extension | ReadonlyArray<Extension>>;
  /** Callback form: replaces registerBuiltInBlocks for an opt-in subset of block types. Runs after `extensions` if both are given. */
  registerBlocks?: (registry: BlockRegistry) => void;
  /** Callback form: replaces registerBuiltInInlineTypes for an opt-in subset of inline types. Runs after `extensions` if both are given. */
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
  /** Adds a Comment button to the floating format toolbar, fully host-controlled — see FloatingToolbarProps.onComment. */
  onComment?: (range: CommentRange) => void;
  /** Current user's id -- enables the whole built-in comments UI (floating toolbar composer, click/hover popover on existing highlights, CommentsPanel) with no host UI code. Ignored by the floating toolbar's button when onComment is also given. */
  commentAuthorId?: string;
  /** Renders CommentsPanel (right-side, Notion/Google Docs-style thread list) automatically. */
  showCommentsPanel?: boolean;
  /** Sends a picked/dropped EmbedBlock file somewhere real (local disk, S3, any other cloud storage) instead of inlining it as a data: URL -- see useFileUpload's own doc comment for the full contract. */
  uploadFile?: (
    file: File,
    ctx: { kind: 'image' | 'video' | 'audio' | 'file' },
  ) => Promise<{ src: string; name?: string; mimeType?: string }>;
  /** Byte cap for the in-document data: URL fallback ONLY (no effect once uploadFile is configured). */
  maxFileSize?: number;
  children?: ReactNode;
}

/** Renders the object useEditor() returned, with every built-in interaction wired up. */
export function NoteloomEditor(props: NoteloomEditorProps): ReactElement;

export interface FindMatch {
  blockId: string;
  runId: string;
  offset: number;
  length: number;
}

/** Finds every occurrence of `query` in the document, in reading order — single-run matches only (see the implementation's own doc comment for scope). */
export function findMatches(
  store: EditorStore | History,
  query: string,
  options?: { caseSensitive?: boolean; wholeWord?: boolean },
): FindMatch[];
/** Replaces one match's own slice of its run's text, one atomic write. */
export function replaceMatch(
  store: EditorStore | History,
  match: FindMatch,
  replacement: string,
): void;
/** Replaces every given match, one write per affected run, one atomic undo step. */
export function replaceAllMatches(
  store: EditorStore | History,
  matches: FindMatch[],
  replacement: string,
): void;

export interface UseFindInDocumentResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  query: string;
  setQuery: (value: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (value: boolean) => void;
  wholeWord: boolean;
  setWholeWord: (value: boolean) => void;
  isReplaceOpen: boolean;
  setIsReplaceOpen: (value: boolean) => void;
  replacement: string;
  setReplacement: (value: string) => void;
  matches: FindMatch[];
  currentIndex: number;
  next: () => void;
  prev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
  queryInputRef: RefObject<HTMLInputElement | null>;
}

/** Ctrl/Cmd+F (while `containerRef` has focus) find/replace — see NoteloomEditor's own doc comment for scope. Pair with `<FindBar>`, or build custom chrome off this hook's returned state/actions directly. */
export function useFindInDocument(
  containerRef: RefObject<HTMLElement | null>,
): UseFindInDocumentResult;
export function FindBar(props: UseFindInDocumentResult): ReactElement | null;

// ---------------------------------------------------------------------------
// people/people.js, react/usePeople.js — a document's own people list
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  color?: string;
  [key: string]: unknown;
}

export function addPerson(
  store: EditorStore | History,
  person: { name: string; color?: string },
): string;
export function updatePerson(
  store: EditorStore | History,
  id: string,
  patch: Partial<Person>,
): void;
export function removePerson(store: EditorStore | History, id: string): void;
/** Reactive view of the document's `people` collection. */
export function usePeople(): Person[];

// ---------------------------------------------------------------------------
// react/useSmartQuotes.js, react/useAutoPairBrackets.js — optional typing behaviors
// ---------------------------------------------------------------------------

/** Straight `"`/`'` typed while composing becomes the contextually correct curly quote (one char in, one out). */
export function useSmartQuotes(): void;
/** Typing `(`/`[`/`{` inserts the matching closer and puts the caret between them; excludes quotes (that's `useSmartQuotes`). Off inside `code` blocks. */
export function useAutoPairBrackets(): void;
