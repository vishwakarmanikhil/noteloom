import { useEffect, useState } from 'react';

const TOUCH_INPUT_CLASS = 'be-touch-input';

function matchesCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

/**
 * Reactive "should touch-first UI show right now" signal.
 *
 * A static `matchMedia('(pointer: coarse)')` check alone is the wrong tool
 * for this: it reports the device's *primary* pointer type, which is a
 * fixed hardware/OS classification, not "what is the user actually using
 * right now." A touchscreen laptop (2-in-1s, Surface-style devices, plenty
 * of ordinary Windows laptops) has a real touchscreen sitting right there
 * that can be used at any moment, but the OS reports the trackpad/mouse as
 * primary — so a pure media-query check would never show touch UI on that
 * device even while the user is actively tapping the screen. There's no
 * reliable way to ask "does this device have touch" and get an answer that
 * actually predicts the next interaction; the only trustworthy signal is
 * the interaction itself.
 *
 * So: `matchMedia` only supplies the *initial* guess (correct before any
 * interaction has happened at all, including for SSR) — every real
 * `pointerdown` afterward overrides it with that event's own `pointerType`
 * ('touch'/'pen' switch touch UI on, 'mouse' switches it off), so a hybrid
 * device correctly shows desktop UI while its trackpad is in use and
 * mobile UI the instant the screen is tapped, with no reload needed either
 * way.
 *
 * Also mirrors the result onto `document.documentElement`'s classList
 * (`be-touch-input`) so plain CSS — the block gutter's touch handling, in
 * particular — can react to the same live signal, not just whatever calls
 * this hook directly.
 */
export function useCoarsePointer() {
  const [isTouch, setIsTouch] = useState(matchesCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePointerDown = (event) => {
      setIsTouch(event.pointerType === 'touch' || event.pointerType === 'pen');
    };
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    document.documentElement?.classList.toggle(TOUCH_INPUT_CLASS, isTouch);
  }, [isTouch]);

  return isTouch;
}
