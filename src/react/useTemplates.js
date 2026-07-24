import { useCallback, useEffect, useState } from 'react';
import { listTemplates } from '../persistence/indexedDbPersistence.js';

/**
 * Reactive access to the stored template library (see saveTemplate/
 * loadTemplate/deleteTemplate/listTemplates) — for building a gallery/picker
 * UI (see TemplatePicker) backed by IndexedDB. Loads on mount and whenever
 * `scope` changes; `refresh()` re-queries on demand (e.g. right after a
 * saveTemplate/deleteTemplate call made elsewhere, since nothing here
 * subscribes to storage writes automatically).
 *
 * `scope` (optional) filters to `'document'` or `'block'` templates only —
 * client-side, since IndexedDB's `getAll()` already returns the whole
 * (typically small) template library in one read; omit it to get both.
 */
export function useTemplates({ scope } = {}) {
  const [templates, setTemplates] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(() => {
    setIsLoaded(false);
    return listTemplates().then((all) => {
      setTemplates(scope ? all.filter((t) => t.scope === scope) : all);
      setIsLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    listTemplates().then((all) => {
      if (cancelled) return;
      setTemplates(scope ? all.filter((t) => t.scope === scope) : all);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return { templates, isLoaded, refresh };
}
