import { useEffect, useState, useCallback } from 'react';

/**
 * Watches for a new, already-installed-but-waiting service worker (the
 * standard signal that a fresh build is available) and exposes a way to
 * activate it. Generic — works with any service worker registration,
 * however it got there (vite-plugin-pwa, a hand-written registration,
 * Workbox, ...); this hook doesn't register one itself, only observes.
 *
 * This is what makes "the app shell loads with no internet" (an offline-
 * capable service worker, set up at the host app's build level — see
 * README's "Offline app shell (PWA)" section) safe to combine with
 * "actually ship updates to users": without surfacing that a new version
 * is waiting, a service-worker-cached app can silently keep serving a
 * stale build indefinitely once installed.
 *
 * Returns `{ updateAvailable, applyUpdate }` — `applyUpdate()` tells the
 * waiting worker to activate and reloads the page once it has. No-ops
 * harmlessly (updateAvailable stays false) in a browser/context with no
 * service worker support, or when no registration exists yet.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if (!navigator.serviceWorker) return undefined;
    let cancelled = false;

    function watchRegistration(registration) {
      if (!registration) return;
      const noteWaiting = () => {
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }
      };
      noteWaiting(); // a worker may already be waiting by the time this hook mounts
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) noteWaiting();
        });
      });
    }

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!cancelled) watchRegistration(registration);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    const reloadOnceControllerChanges = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnceControllerChanges, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}
