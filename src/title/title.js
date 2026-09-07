import { setTitle as setTitleOp } from '../store/operations.js';

/**
 * Documented entry point for setting a document's own title — real,
 * collaboration-aware document data (see EditorStore's `docTitle`
 * fieldWrite handling), not a device-local/storage-layer concern. A host
 * app that stores its own separate "note title" field entirely outside
 * the document (as a filesystem/DB record, say) and never routes edits to
 * it through here will find title changes never reach collaborators —
 * only what flows through the store's own operations syncs.
 */
export function setTitle(store, title) {
  store.applyOperation(setTitleOp(title));
}
