# noteloom

A React-first, block-based rich text editor with **zero runtime dependencies** — the only things it expects from your app are `react` and `react-dom`. Everything else (undo/redo, clipboard, slash commands, tables, inline widgets) is built from scratch on top of a small normalized document store.

## Why this exists

Most rich-text editors either bring their own large dependency tree, or force every "special" piece of content (a dropdown, a date, a mention) onto its own line. This one is built around two ideas:

- **Inline heterogeneous content is a first-class citizen.** A `select` dropdown, a date picker, or an `@mention` chip can sit in the middle of a sentence, mixed with regular text, in one paragraph — not forced onto a block of its own.
- **Fine-grained React re-rendering, no virtual-DOM-for-content-editable fights.** Every block subscribes only to its own data via `useSyncExternalStore`; editing one paragraph in a 500-block document doesn't re-render anything else (see `test/performance/largeDocument.test.jsx` for the regression guard on this).

## Install

```bash
npm install noteloom react react-dom
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
} from 'noteloom';
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

## Picking only the blocks you want

`registerBuiltInBlocks`/`registerBuiltInInlineTypes` register everything at
once — the fastest way to a fully-featured editor. If you'd rather ship
only what you actually use (TipTap's `extensions: [...]` idea), every
built-in block/inline type is also exported individually, and
`registerBlocks`/`registerInlineTypes` register just the ones you name:

```js
import {
  createBlockRegistry,
  registerBlocks,
  paragraphBlockType,
  headingBlockType,
  TABLE_BLOCKS, // table needs its row/cell types alongside it — spread the whole group
} from 'noteloom';

const registry = createBlockRegistry();
registerBlocks(registry, {
  paragraph: paragraphBlockType,
  heading: headingBlockType,
  ...TABLE_BLOCKS,
});
// registry now only knows about paragraph/heading/table — nothing else
// (callout, button, embed, ...) shows up in the slash menu or renders at all.
```

`registerBuiltInBlocks(registry)` is itself just `registerBlocks(registry, { paragraph: paragraphBlockType, ... })` with every type included — so mixing "give me everything" and "just these few" across different parts of your app is never an either/or choice. `layout` has the same "needs its own group" shape as `table` — see `LAYOUT_BLOCKS`. `TABLE_SELECT_INLINE_TYPES` (inline side) is only needed if you use a table's "select" column type.

## Built-in inline types

Atomic, non-text content that can be spliced into running text via the slash menu at any cursor position — `select` (with in-editor add/remove-option UI), `date` (native `<input type="date">`).

There's no separate hardcoded `mention` type — an `@name` chip is just an ordinary use of `createSelectFieldType` (see the next section), with `triggers: ['slash', 'at']` so it also shows up under a second, dedicated "@" trigger (`useAtMenuTrigger`), alongside "/". See the example app's "Assignee" field type for a full worked example.

## Custom select field types (static, or dynamic/API-backed)

`createSelectFieldType(config)` builds a full, ready-to-register inline type from a plain config object — this is how you add your own named dropdown ("Assignee", "Status", "Priority", ...) without writing a component:

```js
import { createInlineRegistry, createSelectFieldType } from 'noteloom';

const inlineRegistry = createInlineRegistry();

inlineRegistry.register(
  'status',
  createSelectFieldType({
    type: 'status', // must match the key you register it under
    label: 'Status', // shown in the "/" menu and as the search box's aria-label
    placeholder: 'Set status…',
    variant: 'tag', // 'tag' = Notion-style colored pill; 'default' = plain bordered dropdown
    options: [
      { value: 'todo', label: 'To do', color: { bg: '#e9e9e7', text: '#37352f' } },
      { value: 'doing', label: 'In progress', color: { bg: '#fdecc8', text: '#a06400' } },
      { value: 'done', label: 'Done', color: { bg: '#dbeddb', text: '#2f7a2f' } },
    ],
  }),
);
```

`options` can also be a **function** instead of a plain array — `(query) => Option[] | Promise<Option[]>` — for a real database/API-backed search (React Select's `loadOptions`, essentially):

```js
inlineRegistry.register(
  'assignee',
  createSelectFieldType({
    type: 'assignee',
    label: 'Assignee',
    placeholder: 'Assign to…',
    variant: 'tag',
    triggers: ['slash', 'at'], // reachable via "/assignee" AND by typing "@" directly
    options: async (query) => {
      const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
      const users = await res.json();
      return users.map((u) => ({ value: u.id, label: u.name }));
    },
  }),
);
```

A few things worth knowing about the dynamic path:

- Your function is called **fresh on every keystroke**, debounced ~250ms — there's no built-in caching layer, so if you want caching, memoize inside your own function.
- Only the **resolved pick** — `{ value, label }` (plus `color` for the tag variant) — is ever written onto the document. The live options list itself is never persisted, so a chip never embeds a stale snapshot of your database; re-opening it always calls your function again.
- `triggers` (default `['slash']`) decides whether the type shows up under `/`, `@` (via `useAtMenuTrigger`), or both — see the "Assignee" example above. A field that doesn't read naturally after "@" (e.g. "Priority") should usually stay slash-only.

### Letting end users create their own field types, in-editor

The above is for types **you** define in code. If you also want a non-technical end user to be able to create new (always static — there's no way to author a fetch function through a UI) select types from inside the editor itself, mount `FieldTypeEditorModal` once and wire a button to it:

```jsx
import { EditorProvider, FieldTypeEditorModal, useFieldTypeEditor } from 'noteloom';

function NewFieldTypeButton() {
  const { openCreate } = useFieldTypeEditor();
  return <button onClick={openCreate}>+ New field type</button>;
}

// Anywhere under <EditorProvider>:
<NewFieldTypeButton />
<FieldTypeEditorModal />
```

User-created types are persisted in the document's own `fieldTypes` collection (so they survive reload) and are automatically rehydrated back into your inline registry by `FieldTypeEditorModal` itself — you don't need to call anything extra. Each chip's popover also gets a "Manage options…" entry that reopens this same modal, pre-filled, for renaming/editing/deleting the type it belongs to.

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
- `select`'s option-adding UI and any `createSelectFieldType`-based type's options (e.g. an "Assignee" @-mention) are meant as a starting point — a real app will want to wire its own people/options source.
- Automated tests run under jsdom; there is no automated real-browser test suite. If you hit an edge case jsdom can't reproduce (anything involving actual native `contentEditable` browser quirks), please file an issue with the exact browser/OS and steps.
