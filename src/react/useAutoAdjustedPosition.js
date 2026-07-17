import { useLayoutEffect, useState } from 'react';
import { clampLeftToViewport, clampTopToViewport } from './popoverPosition.js';

/**
 * Takes a `{ top, left }` position computed off a trigger's own
 * getBoundingClientRect() (as every portaled top-left-anchored menu here
 * already does) and, once the portaled element has actually mounted at
 * `menuRef`, measures its real size and shifts it back inside the viewport
 * if it would otherwise overflow — same "shift" behavior as antd's
 * `autoAdjustOverflow`, not a side-flip. Without this, a menu anchored near
 * the right/bottom edge (e.g. TurnIntoSubmenu opening to the right of its
 * trigger) can render partly or entirely off-screen, making its items
 * unreachable.
 *
 * `top`/`left` are taken as plain numbers (not a `{top,left}` object) so a
 * caller re-rendering every frame doesn't retrigger the adjustment via a
 * fresh object identity — only an actual numeric change re-anchors.
 *
 * Two-phase by design: the first effect snaps to the raw, unadjusted
 * position (matching the trigger) so the menu doesn't visibly jump on open;
 * the second effect then measures and clamps once real layout exists. Since
 * clamping the already-clamped position is a no-op, this settles after at
 * most one extra render — never loops. Both effects are `useLayoutEffect`s,
 * so React flushes the whole chain before the browser paints; nothing
 * visibly flashes at the raw position first.
 *
 * Only fits a plain top-left anchor (box grows right/down, no CSS
 * transform) — see popoverPosition.js's other hooks for centered
 * (translateX(-50%)) or right-anchored (translateX(-100%)) popovers, which
 * need the clamp math applied differently.
 */
export function useAutoAdjustedPosition(menuRef, isOpen, top, left) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (top == null || left == null) {
      setPosition(null);
      return;
    }
    setPosition({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, left]);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || !position) return;
    const rect = menuRef.current.getBoundingClientRect();
    const clampedLeft = clampLeftToViewport(position.left, rect.width);
    const clampedTop = clampTopToViewport(position.top, rect.height);
    if (clampedLeft !== position.left || clampedTop !== position.top) {
      setPosition({ top: clampedTop, left: clampedLeft });
    }
  }, [isOpen, menuRef, position]);

  return position;
}
