import { useLayoutEffect, useState } from 'react';

const MARGIN = 8;

/**
 * Takes a `{ top, left }` position computed off a trigger's own
 * getBoundingClientRect() (as every portaled menu here already does) and,
 * once the portaled element has actually mounted at `menuRef`, measures its
 * real size and shifts it back inside the viewport if it would otherwise
 * overflow — same "shift" behavior as antd's `autoAdjustOverflow`, not a
 * side-flip. Without this, a menu anchored near the right/bottom edge (e.g.
 * TurnIntoSubmenu opening to the right of its trigger) can render partly or
 * entirely off-screen, making its items unreachable.
 *
 * `top`/`left` are taken as plain numbers (not a `{top,left}` object) so a
 * caller re-rendering every frame doesn't retrigger the adjustment via a
 * fresh object identity — only an actual numeric change re-anchors.
 *
 * Two-phase by design: the first effect snaps to the raw, unadjusted
 * position (matching the trigger) so the menu doesn't visibly jump on open;
 * the second effect then measures and clamps once real layout exists. Since
 * clamping the already-clamped position is a no-op, this settles after at
 * most one extra render — never loops.
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
    const maxLeft = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
    const maxTop = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
    const clampedLeft = Math.min(Math.max(position.left, MARGIN), maxLeft);
    const clampedTop = Math.min(Math.max(position.top, MARGIN), maxTop);
    if (clampedLeft !== position.left || clampedTop !== position.top) {
      setPosition({ top: clampedTop, left: clampedLeft });
    }
  }, [isOpen, menuRef, position]);

  return position;
}
