import { useEffect, useState } from 'react';

function matchesTouchOnly() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true
  );
}

/**
 * Static "is this a phone/tablet" device classification — deliberately
 * different from `useCoarsePointer`'s reactive "what was just tapped"
 * signal, and needed for decisions that must NOT flip just because someone
 * touched a touchscreen laptop's display once (see `useSlashMenuTrigger`,
 * which needs exactly this: suppress the slash command menu in favor of
 * `MobileActionBar`'s own "+" picker on a real phone/tablet, but keep it on
 * every laptop, 2-in-1s included).
 *
 * `(hover: none)` is the key piece: a touchscreen laptop or 2-in-1 still has
 * a trackpad or mouse as its PRIMARY pointer, which supports hovering, so
 * it reports `hover: hover` even while its touchscreen is actively being
 * used — only a device with no hover-capable pointer at all (an ordinary
 * phone or tablet with no mouse/trackpad attached) matches `(hover: none)
 * and (pointer: coarse)` together. Reacts to the query's own `change` event
 * (an external mouse being attached to or removed from a tablet), never to
 * an individual touch/mouse event the way `useCoarsePointer` does.
 */
export function useTouchOnlyDevice() {
  const [isTouchOnly, setIsTouchOnly] = useState(matchesTouchOnly);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
    const handleChange = () => setIsTouchOnly(mql.matches);
    handleChange();
    mql.addEventListener?.('change', handleChange);
    return () => mql.removeEventListener?.('change', handleChange);
  }, []);

  return isTouchOnly;
}
