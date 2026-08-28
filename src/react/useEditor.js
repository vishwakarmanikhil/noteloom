import { useMemo } from 'react';
import { EditorStore } from '../store/EditorStore.js';
import { History } from '../store/history.js';
import { createBlockRegistry } from '../registry/blockRegistry.js';
import { createInlineRegistry } from '../registry/inlineRegistry.js';
import { registerBuiltInBlocks } from '../blocks/index.js';
import { registerBuiltInInlineTypes } from '../inlineTypes/index.js';
import { registerExtensions } from '../registry/define.js';
import { genId } from '../utils/idGen.js';

function defaultDoc() {
  const rootId = 'root';
  const blockId = genId();
  const runId = genId();
  return {
    rootId,
    blocks: [
      { id: rootId, type: 'page', parentId: null, contentIds: [blockId], props: {} },
      { id: blockId, type: 'paragraph', parentId: rootId, contentIds: [runId], props: {} },
    ],
    runs: [{ id: runId, type: 'text', value: '', marks: {} }],
  };
}

/**
 * The one-call path to a working editor: creates and memoizes the store
 * (undo/redo-aware by default) plus both registries, pre-populated with
 * every built-in block/inline type, so the common case needs no manual
 * wiring. Pass the result to <NoteloomEditor editor={...} />, or use its
 * `store`/`registry`/`inlineRegistry` fields directly with <EditorProvider>
 * for anything this doesn't cover — nothing here is hidden, just defaulted.
 *
 * `extensions` is the newer, recommended way to pick what's registered: an
 * array of `defineBlock()` / `defineInline()` results (nesting allowed), e.g.
 * `useEditor({ extensions: [...starterKit(), myBlock] })`. Passing it turns
 * OFF the automatic built-in registration (like `registerBlocks` does), so
 * spread `starterKit()` in if you want the usual set. `registerBlocks` /
 * `registerInlineTypes` are the older callback form — still supported, and
 * they run *after* `extensions` if you pass both, so you can add a few
 * imperatively on top. With none of the three given, every built-in block and
 * inline type is registered.
 *
 * The store is created once, on first render — pass a different `doc` and
 * change `key` on the consuming component to load a different document,
 * the same convention used throughout this package's examples.
 *
 * `currentUserId`, if given, is stamped as every edit's `actorId` (see
 * History's `defaultActorId`) with no per-call-site wiring needed —
 * `createAutoVersionHistory`'s own "who changed this" attribution reads it
 * straight off the history log this populates. Since the store is only
 * built once, changing `currentUserId` on a later render has no effect —
 * call `editor.store.setDefaultActorId(id)` directly if it can change after
 * mount (e.g. identity resolving asynchronously).
 */
export function useEditor({
  doc,
  history = true,
  currentUserId = null,
  extensions,
  registerBlocks: customRegisterBlocks,
  registerInlineTypes: customRegisterInlineTypes,
} = {}) {
  return useMemo(() => {
    const registry = createBlockRegistry();
    const inlineRegistry = createInlineRegistry();

    if (extensions != null) {
      registerExtensions(extensions, { registry, inlineRegistry });
    }
    // Block and inline registration are independent: an explicit callback for
    // one side doesn't suppress the built-ins on the other. `extensions`
    // suppresses the built-ins on both sides (opt-in), but a callback passed
    // alongside it still runs, on top.
    if (customRegisterBlocks) customRegisterBlocks(registry);
    else if (extensions == null) registerBuiltInBlocks(registry);

    if (customRegisterInlineTypes) customRegisterInlineTypes(inlineRegistry);
    else if (extensions == null) registerBuiltInInlineTypes(inlineRegistry);

    const store = new EditorStore(doc ?? defaultDoc());
    return {
      store: history ? new History(store, { defaultActorId: currentUserId }) : store,
      registry,
      inlineRegistry,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
