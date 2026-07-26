const DB_NAME = 'noteloom-documents';
const STORE_NAME = 'documents';
const TEMPLATES_STORE_NAME = 'templates';
const VERSIONS_STORE_NAME = 'versions';
const DB_VERSION = 3;

/**
 * IndexedDB-backed local persistence for documents (the shape `EditorStore
 * .toJSON()`/`.fromJSON()` already produce/accept) — native browser API,
 * no added dependency. Chosen over `localStorage` deliberately: documents
 * can carry large embedded media as `data:` URLs (this editor doesn't do
 * server uploads — see EmbedBlock.jsx), easily exceeding localStorage's
 * ~5-10MB synchronous string-only quota, whereas IndexedDB is async and
 * has a much larger practical ceiling.
 *
 * One shared connection is reused across calls rather than opened fresh
 * each time (opening is itself an async round-trip) — lazily created on
 * first use, cached in-module.
 */
let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(TEMPLATES_STORE_NAME)) {
        // Inline-keyed (unlike `documents`' external key) -- listTemplates()
        // needs getAll() to return full {id, name, ...} objects in one read
        // for a gallery UI, not just keys.
        request.result.createObjectStore(TEMPLATES_STORE_NAME, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains(VERSIONS_STORE_NAME)) {
        // Same inline-keyed shape as templates, same reason (a version
        // history list needs full {id, docId, timestamp, ...} objects in
        // one read). No index on docId -- listDocumentVersions() filters
        // client-side after getAll(), same no-index precedent as
        // listTemplates(); per-document version counts are small enough
        // that this is fine.
        request.result.createObjectStore(VERSIONS_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Persists `doc` (a plain object, e.g. from `store.toJSON()`) under `docId`, overwriting whatever was there before. */
export async function savePersistedDocument(docId, doc) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(doc, docId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the persisted document for `docId`, or `null` if nothing has been saved under that id yet. */
export async function loadPersistedDocument(docId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(docId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Removes the persisted document for `docId`, if any. A no-op if nothing was stored under that id. */
export async function deletePersistedDocument(docId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(docId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Every docId with a persisted document — e.g. for a "recent documents" list. Insertion/write order is not guaranteed. */
export async function listPersistedDocumentIds() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists a template — `{ id, scope: 'document' | 'block', name,
 * description?, doc }`, where `doc` is a full document (for `'document'`
 * scope, e.g. from `exportDocumentJSON`) or `{ roots }` (for `'block'`
 * scope, from `captureBlockTemplate`) — overwriting whatever was stored
 * under the same `id` before. Separate object store from `documents`
 * (see openDatabase above): a template is independent of any one document
 * instance, not "the current document."
 */
export async function saveTemplate(template) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATES_STORE_NAME, 'readwrite');
    tx.objectStore(TEMPLATES_STORE_NAME).put(template);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the template stored under `id`, or `null` if none exists. */
export async function loadTemplate(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATES_STORE_NAME, 'readonly');
    const request = tx.objectStore(TEMPLATES_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Removes the template stored under `id`, if any. A no-op if nothing was stored under that id. */
export async function deleteTemplate(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATES_STORE_NAME, 'readwrite');
    tx.objectStore(TEMPLATES_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Every stored template, in full (unlike listPersistedDocumentIds, which only returns keys) — for rendering a gallery/picker without a per-template round trip. Insertion/write order is not guaranteed. */
export async function listTemplates() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATES_STORE_NAME, 'readonly');
    const request = tx.objectStore(TEMPLATES_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists one named point-in-time snapshot of a document — `{ id, docId,
 * timestamp, label?, doc }`, where `doc` is a full document (the same
 * shape a document-scope template uses). Separate object store from both
 * `documents` and `templates` (see openDatabase above): a version is tied
 * to one specific document's history, not "the current document" or a
 * reusable starter. Overwrites whatever was stored under the same `id`
 * before, though callers normally mint a fresh `id` per snapshot (see
 * `createPeriodicVersionSnapshotter`) rather than reusing one.
 */
export async function saveDocumentVersion(version) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSIONS_STORE_NAME, 'readwrite');
    tx.objectStore(VERSIONS_STORE_NAME).put(version);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the version stored under `id`, or `null` if none exists. */
export async function loadDocumentVersion(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSIONS_STORE_NAME, 'readonly');
    const request = tx.objectStore(VERSIONS_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Removes the version stored under `id`, if any. A no-op if nothing was stored under that id. */
export async function deleteDocumentVersion(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSIONS_STORE_NAME, 'readwrite');
    tx.objectStore(VERSIONS_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Every version saved for `docId`, in full, newest first. Filters client-side after a full getAll() -- see openDatabase's own note on why there's no docId index. */
export async function listDocumentVersions(docId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSIONS_STORE_NAME, 'readonly');
    const request = tx.objectStore(VERSIONS_STORE_NAME).getAll();
    request.onsuccess = () => {
      const all = request.result.filter((v) => v.docId === docId);
      all.sort((a, b) => b.timestamp - a.timestamp);
      resolve(all);
    };
    request.onerror = () => reject(request.error);
  });
}
