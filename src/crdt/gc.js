const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * A ready-made "just handle it" wrapper around `store.pruneTombstones()`
 * — runs it on a periodic timer for the lifetime of a session, so a
 * long-running collaborative document doesn't need anyone to remember to
 * call it manually. Purely opt-in (nothing in the store or CollabSession
 * calls this on its own) — construct one if you want it.
 *
 * `store` is anything with `pruneTombstones()` (an `EditorStore`, or a
 * `History` wrapping one). Returns `{ stop }` — call it when the store is
 * no longer in use to clear the timer.
 */
export function createPeriodicTombstoneGC({ store, intervalMs = DEFAULT_INTERVAL_MS, maxAgeMs = DEFAULT_MAX_AGE_MS, onPrune, onError }) {
  const timer = setInterval(() => {
    try {
      const removed = store.pruneTombstones({ maxAgeMs });
      if (removed > 0) onPrune?.(removed);
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
