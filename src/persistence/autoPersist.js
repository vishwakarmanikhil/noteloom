import { savePersistedDocument } from './indexedDbPersistence.js';

const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Wires a store (an `EditorStore`, or a `History` wrapping one — anything
 * with `subscribeAll`/`toJSON`) up to debounced auto-save into IndexedDB
 * under `docId`. Fires on every mutation, local or remote (subscribeAll
 * doesn't distinguish), so a document being live-collaborated on stays
 * persisted the same as one edited solo.
 *
 * Debounced rather than saving on every single keystroke: `toJSON()`
 * serializes the whole document, and typing already fires a store
 * mutation per keystroke — saving synchronously on each one would mean a
 * full-document IndexedDB write per character typed, which gets
 * expensive fast on a larger document.
 *
 * Returns a `stop()` function — call it when the store is no longer in
 * use (e.g. navigating away from this document) to unsubscribe and
 * cancel any pending debounced save. `stop()` does NOT flush a pending
 * save first; call `flush()` (also returned) beforehand if the most
 * recent edit must be persisted before tearing down.
 */
export function createAutoPersistence({ store, docId, debounceMs = DEFAULT_DEBOUNCE_MS, onError }) {
  let timer = null;

  function saveNow() {
    savePersistedDocument(docId, store.toJSON()).catch((err) => onError?.(err));
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      saveNow();
    }
  }

  const unsubscribe = store.subscribeAll(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveNow();
    }, debounceMs);
  });

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    unsubscribe();
  }

  return { stop, flush };
}
