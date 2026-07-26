import { exportDocumentJSON } from '../clipboard/exportDocument.js';
import { saveDocumentVersion, listDocumentVersions, deleteDocumentVersion } from '../persistence/indexedDbPersistence.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_VERSIONS = 50;

/**
 * A ready-made "just handle it" wrapper that periodically snapshots a live
 * document into the `versions` IndexedDB store (see saveDocumentVersion/
 * listDocumentVersions) — same "opt-in convenience timer" shape as
 * `createPeriodicTombstoneGC`. Purely opt-in; nothing else calls this on
 * its own. Returns `{ stop }` — call it when the store is no longer in use
 * to clear the timer.
 *
 * Prunes oldest-first beyond `maxVersions` for this `docId` after each
 * snapshot, so a long-running session doesn't grow the store unbounded.
 */
export function createPeriodicVersionSnapshotter({
  store,
  docId,
  intervalMs = DEFAULT_INTERVAL_MS,
  label,
  maxVersions = DEFAULT_MAX_VERSIONS,
  onSnapshot,
  onError,
}) {
  const timer = setInterval(async () => {
    try {
      const doc = JSON.parse(exportDocumentJSON(store));
      const version = { id: crypto.randomUUID(), docId, timestamp: Date.now(), label, doc };
      await saveDocumentVersion(version);
      onSnapshot?.(version);

      const all = await listDocumentVersions(docId);
      if (all.length > maxVersions) {
        const excess = all.slice(maxVersions);
        await Promise.all(excess.map((v) => deleteDocumentVersion(v.id)));
      }
    } catch (err) {
      onError?.(err);
    }
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
