# @notevo/block-editor

A React-first, block-based rich text editor with **zero runtime dependencies** — the only things it expects from your app are `react` and `react-dom`. Everything else (undo/redo, clipboard, slash commands, tables, inline widgets) is built from scratch on top of a small normalized document store.

## Why this exists

Most rich-text editors either bring their own large dependency tree, or force every "special" piece of content (a dropdown, a date, a mention) onto its own line. This one is built around two ideas:

- **Inline heterogeneous content is a first-class citizen.** A `select` dropdown, a date picker, or an `@mention` chip can sit in the middle of a sentence, mixed with regular text, in one paragraph — not forced onto a block of its own.
- **Fine-grained React re-rendering, no virtual-DOM-for-content-editable fights.** Every block subscribes only to its own data via `useSyncExternalStore`; editing one paragraph in a 500-block document doesn't re-render anything else (see `test/performance/largeDocument.test.jsx` for the regression guard on this).

## Install

```bash
npm install @notevo/block-editor react react-dom
```

## Quick start

```jsx
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
} from '@notevo/block-editor';
import { useMemo, useRef } from 'react';

function Editor() {
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
```

See `examples/basic` for a complete working app (run `npm run dev`).

Note: this package ships **no default CSS** — style the block class names (`.be-paragraph`, `.be-heading`, `.be-list-item`, `.be-table`, `.be-inline-select`, etc.) yourself, or copy `examples/basic/src/style.css` as a starting point.

## Built-in block types

`paragraph`, `heading` (h1–h3), `listItem` (bulleted, numbered, and to-do — with Notion-style Tab/Shift+Tab nesting and Enter conventions), `table` (with row/column insert/delete), `layout` (multi-column), `divider`.

## Built-in inline types

Atomic, non-text content that can be spliced into running text via the slash menu at any cursor position — `select` (with in-editor add/remove-option UI), `date` (native `<input type="date">`), `mention` (`@name`, backed by a fixed demo roster — swap it for your own directory in a real app).

## Registering your own block/inline types

```js
registry.register('myBlock', {
  component: MyBlockComponent, // receives only { id }
  isLeaf: true, // true if contentIds holds run ids, false if it holds child block ids
  toHTML(block, ctx) { /* ... */ },
  fromHTML(domNode, ctx) { /* ... or return null if this node isn't yours */ },
  toPlainText(block, ctx) { /* ... */ },
  slashCommand: { label: 'My Block', keywords: ['my'], run(store, ctx) { /* ... */ } },
});
```

## Development

```bash
npm install
npm run dev     # examples/basic dev server
npm test        # vitest (jsdom + @testing-library/react)
npm run build   # library build (dist/, ESM + CJS)
```

## Known limitations

- No accessibility affordance exists for grouping sibling list items under a shared `role="list"` container (each list item is an independent block, not wrapped in one) — adding `role="listitem"` without that ancestor would be worse than no role at all, so it's deliberately left out pending a bigger structural change.
- Cross-block mark toggling (bold/italic/underline over a selection spanning multiple blocks) applies as one store operation per block, not a single atomic undo step.
- `mention`'s roster and `select`'s option-adding UI are both meant as a starting point — a real app will want to wire its own people/options source.
- Automated tests run under jsdom; there is no automated real-browser test suite. If you hit an edge case jsdom can't reproduce (anything involving actual native `contentEditable` browser quirks), please file an issue with the exact browser/OS and steps.
