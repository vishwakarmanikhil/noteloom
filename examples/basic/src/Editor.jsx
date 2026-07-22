import {
  EditorStore,
  History,
  EditorProvider,
  BlockChildren,
  createBlockRegistry,
  registerBuiltInBlocks,
  createInlineRegistry,
  registerBuiltInInlineTypes,
  useClipboardHandlers,
  useSlashMenuTrigger,
  useEditorKeyboardShortcuts,
  SlashMenu,
} from 'noteloom';
import { useMemo, useRef } from 'react';

export function Editor() {
  const containerRef = useRef(null);
  const { store, registry, inlineRegistry } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    const store = new History(
      new EditorStore({
        rootId: 'root',
        blocks: [
          { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
          { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        ],
        runs: [{ id: 'r1', type: 'text', value: 'Hello — try typing "/" for commands.', marks: {} }],
      }),
    );
    return { store, registry, inlineRegistry };
  }, []);

  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
      <div ref={containerRef} onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
        <BlockChildren parentId="root" />
        <SlashMenu
          isOpen={slashMenu.isOpen}
          rect={slashMenu.rect}
          commands={slashMenu.commands}
          runId={slashMenu.runId}
          onSelect={slashMenu.selectCommand}
          onClose={slashMenu.close}
        />
      </div>
    </EditorProvider>
  );
}
