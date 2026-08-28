// noteloom/versions — Google Docs-style automatic version history: point-in-time
// snapshots, the word-level diff, the reactive hook, and the built-in
// <VersionHistory> drawer. Opt-in entry point; the same names are also
// (deprecated) on the main `noteloom` entry, to be removed in a future major.

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
