// noteloom/versions — Google Docs-style automatic version history: point-in-time
// snapshots, the word-level diff, the reactive hook, and the built-in
// <VersionHistory> drawer. Opt-in entry point; also still re-exported from the
// main `noteloom` entry for backward compatibility (removed in 2.0 — see
// docs/repackaging-plan.md).

export { createAutoVersionHistory } from './versions/autoVersionHistory.js';
export { diffDocumentsHTML } from './versions/diffVersions.js';
export { useDocumentVersions } from './react/useDocumentVersions.js';
export { VersionHistory } from './react/VersionHistory.jsx';

// Raw snapshot storage (shared object store, also reachable via
// noteloom/persistence's sibling document-persistence ops).
export {
  saveDocumentVersion,
  loadDocumentVersion,
  deleteDocumentVersion,
  listDocumentVersions,
} from './persistence/indexedDbPersistence.js';
