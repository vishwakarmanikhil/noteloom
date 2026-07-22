const DB_NAME = 'noteloom-documents';
const STORE_NAME = 'documents';
const DB_VERSION = 1;

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
