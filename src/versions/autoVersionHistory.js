import { exportDocumentJSON } from '../clipboard/exportDocument.js';
import { saveDocumentVersion, listDocumentVersions, deleteDocumentVersion } from '../persistence/indexedDbPersistence.js';

const DEFAULT_IDLE_MS = 5 * 60 * 1000; // 5 minutes of inactivity closes a version, roughly matching how Google Docs groups edits into one revision
const DEFAULT_MAX_VERSIONS = 200;

/**
 * Automatic, Google Docs-style version history — no "type a label and save"
 * step. Listens to `store.subscribeToHistory()` (`store` must be a
 * `History` instance, not a plain `EditorStore` — this needs `getHistoryLog()`)
 * and, after `idleMs` of no further edits, closes the "window" of edits
 * that just happened and saves one snapshot for it: who made them
 * (`authorId`/`authorIds`, read straight off each entry's `actorId` — see
 * History's `defaultActorId`/`useEditor`'s `currentUserId`, no separate
 * identity plumbing needed here), roughly what changed (`summary`, a
 * lightweight count of distinct blocks touched — not a full diff), and the
 * full document snapshot itself for restore/preview.
 *
 * A version is never named/labeled up front — `DocumentVersion.label`
 * still exists for callers who want to rename one afterward, but nothing
 * in this module asks for one.
 */
export function createAutoVersionHistory({ store, docId, idleMs = DEFAULT_IDLE_MS, maxVersions = DEFAULT_MAX_VERSIONS, onSnapshot, onError }) {
  let idleTimer = null;
  let windowStart = store.getHistoryLog().length; // index into historyLog where the current open window begins
  let hasPendingActivity = false;

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  async function finalizeWindow() {
    clearIdleTimer();
    if (!hasPendingActivity) return;
    hasPendingActivity = false;

    const log = store.getHistoryLog();
    const entries = log.slice(windowStart);
    windowStart = log.length;
    if (entries.length === 0) return; // e.g. only an undo/redo happened, nothing new was appended to the log

    const touchedIds = new Set(entries.map((e) => e.id).filter(Boolean));
    const authorIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))];
    const authorId = entries[entries.length - 1].actorId ?? null; // whoever made the most recent edit in this window

    try {
      const doc = JSON.parse(exportDocumentJSON(store)); // exportDocumentJSON returns a JSON *string* -- parse it into the plain object DocumentVersion.doc expects
      const version = {
        id: crypto.randomUUID(),
        docId,
        timestamp: Date.now(),
        authorId,
        authorIds,
        summary: `${touchedIds.size} block${touchedIds.size === 1 ? '' : 's'} changed`,
        doc,
      };
      await saveDocumentVersion(version);
      onSnapshot?.(version);

      const all = await listDocumentVersions(docId); // newest first
      if (all.length > maxVersions) {
        const excess = all.slice(maxVersions);
        await Promise.all(excess.map((v) => deleteDocumentVersion(v.id)));
      }
    } catch (err) {
      onError?.(err);
    }
  }

  const unsubscribe = store.subscribeToHistory(() => {
    hasPendingActivity = true;
    clearIdleTimer();
    idleTimer = setTimeout(finalizeWindow, idleMs);
  });

  return {
    /** Stops listening. Does NOT flush a final in-progress window -- call `flush()` first if you want that (e.g. right before navigating away). */
    stop() {
      clearIdleTimer();
      unsubscribe();
    },
    /** Closes and saves the current window immediately, without waiting for `idleMs` of inactivity. A no-op if nothing's happened since the last save. */
    flush: finalizeWindow,
  };
}
