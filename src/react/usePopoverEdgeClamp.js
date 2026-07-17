import { useLayoutEffect, useState } from 'react';
import { clampLeftToViewport } from './popoverPosition.js';

// All three hooks below share the exact two-phase shape
// useAutoAdjustedPosition.js documents in full (snap to the raw anchor
// first so nothing jumps, then measure + clamp once real layout exists,
// both as useLayoutEffects so the whole chain settles before the browser
// ever paints) — only the *anchor math* differs per popover's own CSS
// convention, so each is kept as its own tiny hook rather than forcing one
// generic shape to cover every transform variant.

/**
 * For a popover that's LEFT-anchored (plain `left: <value>`, no transform)
 * but already owns its own vertical placement (Select/SlashMenu both flip
 * between `top`/`bottom` to dodge the on-screen keyboard) — this only ever
 * touches the horizontal axis, leaving the caller's vertical decision alone.
 */
export function useHorizontalAutoAdjustedLeft(menuRef, isOpen, rawLeft) {
  const [left, setLeft] = useState(null);

  useLayoutEffect(() => {
    setLeft(rawLeft ?? null);
  }, [rawLeft]);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || left == null) return;
    const rect = menuRef.current.getBoundingClientRect();
    const clamped = clampLeftToViewport(left, rect.width);
    if (clamped !== left) setLeft(clamped);
  }, [isOpen, menuRef, left]);

  return left;
}

/**
 * For a popover CENTERED on an x-coordinate via `left: <centerX>;
 * transform: translateX(-50%)` (FloatingToolbar's own bubble, centered over
 * the text selection it's formatting) — clamps the box's actual left/right
 * edges (accounting for the -50% shift) and returns an adjusted `centerX`
 * for that same `left` + `transform: translateX(-50%)` pairing, so the
 * caller's JSX doesn't need to change anything but the number.
 */
export function useAutoAdjustedCenteredLeft(menuRef, isOpen, rawCenterLeft) {
  const [centerLeft, setCenterLeft] = useState(null);

  useLayoutEffect(() => {
    setCenterLeft(rawCenterLeft ?? null);
  }, [rawCenterLeft]);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || centerLeft == null) return;
    const rect = menuRef.current.getBoundingClientRect();
    const half = rect.width / 2;
    const clampedEdge = clampLeftToViewport(centerLeft - half, rect.width);
    const nextCenter = clampedEdge + half;
    if (nextCenter !== centerLeft) setCenterLeft(nextCenter);
  }, [isOpen, menuRef, centerLeft]);

  return centerLeft;
}

/**
 * For a popover RIGHT-anchored on an x-coordinate via `left: <rightEdgeX>;
 * transform: translateX(-100%)` (TableHeaderRow's column menu, whose right
 * edge lines up with the header cell's own right edge and grows leftward)
 * — clamps the box's actual left edge and returns an adjusted `rightEdgeX`
 * for that same `left` + `transform: translateX(-100%)` pairing.
 */
export function useAutoAdjustedRightLeft(menuRef, isOpen, rawRightEdgeLeft) {
  const [rightLeft, setRightLeft] = useState(null);

  useLayoutEffect(() => {
    setRightLeft(rawRightEdgeLeft ?? null);
  }, [rawRightEdgeLeft]);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || rightLeft == null) return;
    const rect = menuRef.current.getBoundingClientRect();
    const clampedEdge = clampLeftToViewport(rightLeft - rect.width, rect.width);
    const nextRightLeft = clampedEdge + rect.width;
    if (nextRightLeft !== rightLeft) setRightLeft(nextRightLeft);
  }, [isOpen, menuRef, rightLeft]);

  return rightLeft;
}
