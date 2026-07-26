import { useCallback, useEffect, useState } from 'react';
import { listDocumentVersions } from '../persistence/indexedDbPersistence.js';

/**
 * Reactive access to the stored version history for one document (see
 * saveDocumentVersion/loadDocumentVersion/deleteDocumentVersion/
 * listDocumentVersions) — for building a version list UI backed by
 * IndexedDB. Loads on mount and whenever `docId` changes; `refresh()`
 * re-queries on demand (e.g. right after a saveDocumentVersion/
 * deleteDocumentVersion call made elsewhere, since nothing here subscribes
 * to storage writes automatically). Restoring a version is not part of
 * this hook -- pass the loaded version's `doc` to `applyDocumentTemplate`.
 */
export function useDocumentVersions(docId) {
  const [versions, setVersions] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(() => {
    if (!docId) return Promise.resolve();
    setIsLoaded(false);
    return listDocumentVersions(docId).then((all) => {
      setVersions(all);
      setIsLoaded(true);
    });
  }, [docId]);

  useEffect(() => {
    if (!docId) {
      setVersions([]);
      setIsLoaded(true);
      return undefined;
    }
    let cancelled = false;
    setIsLoaded(false);
    listDocumentVersions(docId).then((all) => {
      if (cancelled) return;
      setVersions(all);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  return { versions, isLoaded, refresh };
}
