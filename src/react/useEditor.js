import { useMemo } from 'react';
import { EditorStore } from '../store/EditorStore.js';
import { History } from '../store/history.js';
import { createBlockRegistry } from '../registry/blockRegistry.js';
import { createInlineRegistry } from '../registry/inlineRegistry.js';
import { registerBuiltInBlocks } from '../blocks/index.js';
import { registerBuiltInInlineTypes } from '../inlineTypes/index.js';
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
 * `registerBlocks`/`registerInlineTypes` swap in a custom set instead of
 * every built-in type (see the `registerBlocks`/`TABLE_BLOCKS`-style opt-in
 * exports for picking a subset), matching this package's existing
 * opt-in-by-replacement convention rather than an extensions array.
 *
 * The store is created once, on first render — pass a different `doc` and
 * change `key` on the consuming component to load a different document,
 * the same convention used throughout this package's examples.
 */
export function useEditor({ doc, history = true, registerBlocks: customRegisterBlocks, registerInlineTypes: customRegisterInlineTypes } = {}) {
  return useMemo(() => {
    const registry = createBlockRegistry();
    (customRegisterBlocks ?? registerBuiltInBlocks)(registry);
    const inlineRegistry = createInlineRegistry();
    (customRegisterInlineTypes ?? registerBuiltInInlineTypes)(inlineRegistry);
    const store = new EditorStore(doc ?? defaultDoc());
    return { store: history ? new History(store) : store, registry, inlineRegistry };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
