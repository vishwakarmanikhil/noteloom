const MARGIN = 8;

/**
 * Shifts `left`/`top` back inside the viewport (never past the opposite
 * edge either) for a box of the given size — the "shift" strategy antd's
 * `autoAdjustOverflow` uses, not a side-flip. Shared by every popover-
 * positioning hook in this file so the margin/clamp math lives in exactly
 * one place.
 */
export function clampLeftToViewport(left, width) {
  const maxLeft = Math.max(MARGIN, window.innerWidth - width - MARGIN);
  return Math.min(Math.max(left, MARGIN), maxLeft);
}

export function clampTopToViewport(top, height) {
  const maxTop = Math.max(MARGIN, window.innerHeight - height - MARGIN);
  return Math.min(Math.max(top, MARGIN), maxTop);
}
