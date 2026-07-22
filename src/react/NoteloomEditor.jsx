import { useRef } from 'react';
import { EditorProvider } from './EditorProvider.jsx';
import { BlockChildren } from './BlockChildren.jsx';
import { EditorTrailingSpace } from './EditorTrailingSpace.jsx';
import { BlockRangeActionMenu } from './BlockRangeActionMenu.jsx';
import { useClipboardHandlers } from './useClipboardHandlers.js';
import { useEditorKeyboardShortcuts } from './useEditorKeyboardShortcuts.js';
import { useBlockRangeDrag } from './useBlockRangeDrag.js';
import { SlashMenu } from '../commands/SlashMenu.jsx';
import { useSlashMenuTrigger } from '../commands/useSlashMenuTrigger.js';
import { useEmojiMenuTrigger } from '../commands/useEmojiMenuTrigger.js';
import { useAtMenuTrigger } from '../commands/useAtMenuTrigger.js';
import { FloatingToolbar } from '../commands/FloatingToolbar.jsx';
import { useFloatingToolbarTrigger } from '../commands/useFloatingToolbarTrigger.js';

function EditorSurface({ store, rootId }) {
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
 */
export function NoteloomEditor({ editor, className, style, theme, getBlockClassName, children }) {
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
    >
      <EditorSurface store={store} rootId={rootId} />
      {children}
    </EditorProvider>
  );
}
