import { useEffect, useState } from 'react';
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
 * Returns `{ isLoaded }` — `false` until the initial IndexedDB read
 * resolves, so callers can show a loading state instead of briefly
 * flashing default content that's about to be replaced.
 *
 * Known edge case: an edit made in the narrow window between mount and
 * the initial load resolving can be discarded once the load applies
 * (whatever was actually persisted always wins) — acceptable for a
 * hydrate-on-mount pattern, and not reachable in practice outside
 * deliberately racing it.
 */
export function usePersistedDocument({ store, docId, debounceMs, onError }) {
  const [isLoaded, setIsLoaded] = useState(false);

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

    return () => {
      cancelled = true;
      flush();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  return { isLoaded };
}
