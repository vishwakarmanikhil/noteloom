import { useRef } from 'react';
import { EditorProvider } from './EditorProvider.jsx';
import { BlockChildren } from './BlockChildren.jsx';
import { EditorTrailingSpace } from './EditorTrailingSpace.jsx';
import { BlockRangeActionMenu } from './BlockRangeActionMenu.jsx';
import { CommentsPanel } from './CommentsPanel.jsx';
import { useClipboardHandlers } from './useClipboardHandlers.js';
import { useEditorKeyboardShortcuts } from './useEditorKeyboardShortcuts.js';
import { useBlockRangeDrag } from './useBlockRangeDrag.js';
import { SlashMenu } from '../commands/SlashMenu.jsx';
import { useSlashMenuTrigger } from '../commands/useSlashMenuTrigger.js';
import { useEmojiMenuTrigger } from '../commands/useEmojiMenuTrigger.js';
import { useAtMenuTrigger } from '../commands/useAtMenuTrigger.js';
import { FloatingToolbar } from '../commands/FloatingToolbar.jsx';
import { useFloatingToolbarTrigger } from '../commands/useFloatingToolbarTrigger.js';

function EditorSurface({ store, rootId, onComment, commentAuthorId }) {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  const emojiMenu = useEmojiMenuTrigger(containerRef);
  const atMenu = useAtMenuTrigger(containerRef);
  const floatingToolbar = useFloatingToolbarTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);
  useBlockRangeDrag(containerRef);

  return (
    <div ref={containerRef} role="document" aria-label="Document editor" onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <BlockRangeActionMenu />
      <BlockChildren parentId={rootId} isTopLevel />
      <EditorTrailingSpace />
      <SlashMenu
        isOpen={slashMenu.isOpen}
        rect={slashMenu.rect}
        commands={slashMenu.commands}
        runId={slashMenu.runId}
        onSelect={slashMenu.selectCommand}
        onClose={slashMenu.close}
      />
      <SlashMenu
        isOpen={emojiMenu.isOpen}
        rect={emojiMenu.rect}
        commands={emojiMenu.commands}
        runId={emojiMenu.runId}
        onSelect={emojiMenu.selectCommand}
        onClose={emojiMenu.close}
        menuId="be-emoji-menu"
        ariaLabel="Emoji"
      />
      <SlashMenu
        isOpen={atMenu.isOpen}
        rect={atMenu.rect}
        commands={atMenu.commands}
        runId={atMenu.runId}
        onSelect={atMenu.selectCommand}
        onClose={atMenu.close}
        menuId="be-at-menu"
        ariaLabel="Mention"
      />
      <FloatingToolbar
        isOpen={floatingToolbar.isOpen}
        rect={floatingToolbar.rect}
        kind={floatingToolbar.kind}
        selection={floatingToolbar.selection}
        crossSelection={floatingToolbar.crossSelection}
        marks={floatingToolbar.marks}
        store={store}
        onComment={onComment}
        commentAuthorId={commentAuthorId}
      />
    </div>
  );
}

/**
 * The rendering half of useEditor(): everything examples/basic wires by
 * hand — clipboard, slash/emoji/@-mention menus, the floating format
 * toolbar, keyboard shortcuts, block-range drag — bundled into one
 * component. Pass the object useEditor() returned and you're done:
 *
 *   const editor = useEditor();
 *   return <NoteloomEditor editor={editor} />;
 *
 * `className`/`style`/`theme`/`getBlockClassName` forward straight to
 * EditorProvider (see its own doc comment); `children` renders inside the provider alongside
 * the editor surface, for a toolbar or other chrome that needs store
 * access via the usual hooks (useEditorStore, useHistory, ...). Anything
 * this doesn't cover (a custom toolbar, mobile chrome, voice typing, field
 * type management) is still just EditorProvider + the granular hooks/
 * components underneath, unchanged and fully available.
 *
 * Comments, built in:
 * - `onComment`, if given, adds a Comment button to the floating format
 *   toolbar (Notion-style) that calls `onComment(selection)` on click —
 *   full host control over what happens next (open your own UI). See
 *   FloatingToolbar's own doc comment.
 * - `commentAuthorId`, if given (and `onComment` is NOT), makes the whole
 *   comments experience self-contained with no host UI code at all: the
 *   floating toolbar's Comment button opens a small built-in composer,
 *   clicking/hovering existing highlighted text opens a popover to view/
 *   reply/resolve/delete it (CommentPopover, mounted automatically inside
 *   every block), and `showCommentsPanel` (below) adds a right-side list of
 *   every thread in the document. Every reply composed through any of these
 *   built-in surfaces is attributed to this id — see useCommentAuthorId.
 * - `showCommentsPanel`, if true, renders CommentsPanel (Notion/Google
 *   Docs-style, `position: fixed` to the right by default — see
 *   `.be-comments-panel` in style.css) — purely additive to the popover
 *   above, not a replacement for it.
 *
 * `uploadFile`/`maxFileSize` forward straight to `EditorProvider` too — see
 * `useFileUpload`'s own doc comment for the full contract (wiring a picked/
 * dropped file to local disk, S3, or any other cloud storage).
 */
export function NoteloomEditor({
  editor,
  className,
  style,
  theme,
  getBlockClassName,
  onComment,
  commentAuthorId,
  showCommentsPanel,
  uploadFile,
  maxFileSize,
  children,
}) {
  const { store, registry, inlineRegistry } = editor;
  const rootId = store.getRootId();
  return (
    <EditorProvider
      store={store}
      registry={registry}
      inlineRegistry={inlineRegistry}
      history={store}
      className={className}
      style={style}
      theme={theme}
      getBlockClassName={getBlockClassName}
      commentAuthorId={commentAuthorId}
      uploadFile={uploadFile}
      maxFileSize={maxFileSize}
    >
      <EditorSurface store={store} rootId={rootId} onComment={onComment} commentAuthorId={commentAuthorId} />
      {showCommentsPanel && <CommentsPanel authorId={commentAuthorId} />}
      {children}
    </EditorProvider>
  );
}
