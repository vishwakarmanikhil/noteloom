// noteloom/persistence — offline-first local persistence (IndexedDB, native
// browser API, no added dependency) plus the PWA service-worker update hook.
// Opt-in entry point; also still re-exported from the main `noteloom` entry
// for backward compatibility (removed in 2.0 — see docs/repackaging-plan.md).

export {
  savePersistedDocument,
  loadPersistedDocument,
  deletePersistedDocument,
  listPersistedDocumentIds,
} from './persistence/indexedDbPersistence.js';
export { createAutoPersistence } from './persistence/autoPersist.js';
export { usePersistedDocument } from './react/usePersistedDocument.js';
export { useServiceWorkerUpdate } from './react/useServiceWorkerUpdate.js';
