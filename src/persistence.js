// noteloom/persistence — offline-first local persistence (IndexedDB, native
// browser API, no added dependency) plus the PWA service-worker update hook.
// Opt-in entry point; the same names are also (deprecated) on the main
// `noteloom` entry, to be removed in a future major.

export {
  savePersistedDocument,
  loadPersistedDocument,
  deletePersistedDocument,
  listPersistedDocumentIds,
} from './persistence/indexedDbPersistence.js';
export { createAutoPersistence } from './persistence/autoPersist.js';
export { usePersistedDocument } from './react/usePersistedDocument.js';
export { useServiceWorkerUpdate } from './react/useServiceWorkerUpdate.js';
