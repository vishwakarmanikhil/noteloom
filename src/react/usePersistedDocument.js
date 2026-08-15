import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPersistedDocument } from '../persistence/indexedDbPersistence.js';
import { createAutoPersistence } from '../persistence/autoPersist.js';

/**
 * Ties a store to IndexedDB persistence for React usage: loads whatever
 * was last saved under `docId` (if anything) into the store on mount, and
 * auto-saves on every change from then on — the "lightweight editor,
 * works fully offline, no server required" building block.
 *
 * `store` must already exist (created via `useMemo`, same as every
 * example in this package) — this hook does not construct one. If a
 * persisted document is found, the store's content is REPLACED with it
 * (the same direct-swap pattern `CollabSession` uses to adopt a peer's
 * snapshot); if nothing was found, the store is left exactly as its
 * caller initialized it (e.g. with a starter document).
 *
 * Returns `{ isLoaded, save }` — `isLoaded` is `false` until the initial
 * IndexedDB read resolves, so callers can show a loading state instead of
 * briefly flashing default content that's about to be replaced. `save()`
 * forces an immediate write (skipping the rest of any debounce window) and
 * returns a Promise that resolves once it's actually persisted — call it
 * yourself for a manual "Save" button, in addition to whatever the
 * Ctrl/Cmd+S shortcut below already covers.
 *
 * `saveShortcut` (default `true`) wires one document-level Ctrl/Cmd+S
 * keydown listener that calls `save()` and blocks the browser's own "Save
 * Page" dialog — everything here already auto-saves on every edit
 * (debounced), so there's nothing Ctrl+S needs to do that hasn't already
 * happened within `debounceMs`, but the shortcut still matters: it's the
 * muscle-memory reflex every user already has, and without intercepting it
 * the browser's native save-page prompt pops up instead, which reads as
 * "did that just NOT save?" even though it did. `onSave` (optional) fires
 * every time `save()` resolves — e.g. to flash a brief "Saved" toast — for
 * both the shortcut and any manual `save()` call a host app makes itself.
 * Pass `{ saveShortcut: false }` to opt out and wire your own binding.
 *
 * Known edge case: an edit made in the narrow window between mount and
 * the initial load resolving can be discarded once the load applies
 * (whatever was actually persisted always wins) — acceptable for a
 * hydrate-on-mount pattern, and not reachable in practice outside
 * deliberately racing it.
 */
export function usePersistedDocument({ store, docId, debounceMs, onError, saveShortcut = true, onSave }) {
  const [isLoaded, setIsLoaded] = useState(false);
  // The current burst's own flush(), refreshed every time the docId effect
  // below re-runs — save() always goes through this ref rather than
  // closing over one particular createAutoPersistence call, since docId
  // (and so this whole setup) can change across the hook's lifetime.
  const flushRef = useRef(() => Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);

    loadPersistedDocument(docId)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const rawStore = store.store ?? store; // unwrap a History instance to the underlying EditorStore
          rawStore.blocks = new Map((doc.blocks ?? []).map((b) => [b.id, b]));
          rawStore.runs = new Map((doc.runs ?? []).map((r) => [r.id, r]));
          rawStore.rootId = doc.rootId ?? null;
          rawStore.fieldTypes = new Map((doc.fieldTypes ?? []).map((f) => [f.id, f]));
          rawStore._fieldTypesSnapshot = null;
          rawStore._orders = new Map();
          rawStore._notify([...rawStore.blocks.keys(), ...rawStore.runs.keys()]);
        }
      })
      .catch((err) => onError?.(err))
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });

    const { stop, flush } = createAutoPersistence({ store, docId, debounceMs, onError });
    flushRef.current = flush;

    return () => {
      cancelled = true;
      flush();
      stop();
      flushRef.current = () => Promise.resolve();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const save = useCallback(async () => {
    await flushRef.current();
    onSave?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave]);

  useEffect(() => {
    if (!saveShortcut) return undefined;
    const handleKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      // Windows/Linux: Ctrl+S. Mac: Cmd+S (event.metaKey). Same physical
      // gesture, same browser-native "Save Page" dialog to intercept either
      // way — no separate handling needed per platform.
      if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      save();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [saveShortcut, save]);

  return { isLoaded, save };
}
