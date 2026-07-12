import { useEffect, useState } from 'react';

function computeInset() {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  // How much of the layout viewport's bottom is currently covered by the
  // on-screen keyboard (or any other viewport-shrinking browser chrome):
  // the gap between the full layout height and the visual viewport's own
  // bottom edge (its height plus however far it's scrolled/offset down).
  const inset = window.innerHeight - (vv.height + vv.offsetTop);
  return inset > 0 ? Math.round(inset) : 0;
}

/**
 * Tracks the on-screen keyboard's real height via the visualViewport API —
 * 0 when there's no keyboard (or no visualViewport support at all, e.g.
 * older browsers/SSR). This is what lets MobileActionBar sit at
 * `bottom: <inset>px` and land exactly above the keyboard instead of
 * guessing a fixed offset, and lets trigger-menu/Select popovers clamp
 * their own vertical position so they don't render underneath it.
 *
 * Listens on visualViewport's own 'resize'/'scroll' (not window's) — the
 * keyboard opening/closing changes the *visual* viewport, not the layout
 * one, and most mobile browsers don't fire window 'resize' for it at all.
 */
export function useVirtualKeyboardInset() {
  const [inset, setInset] = useState(computeInset);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const handleChange = () => setInset(computeInset());
    handleChange();
    vv.addEventListener('resize', handleChange);
    vv.addEventListener('scroll', handleChange);
    return () => {
      vv.removeEventListener('resize', handleChange);
      vv.removeEventListener('scroll', handleChange);
    };
  }, []);

  return inset;
}
