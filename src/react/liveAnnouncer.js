const LIVE_REGION_ID = 'be-live-region';

/**
 * Lazily creates (once — idempotent, same singleton pattern as
 * injectDefaultStyles.js) a visually-hidden `aria-live="polite"` region
 * appended to `document.body`, so screen-reader users get an announcement
 * for structural actions that don't otherwise move focus anywhere
 * describable (duplicate/move/hide/delete a block or a block range) —
 * previously there was no `aria-live` region anywhere in this codebase at
 * all, so none of those actions were announced.
 */
function getOrCreateLiveRegion() {
  if (typeof document === 'undefined') return null; // SSR guard
  let region = document.getElementById(LIVE_REGION_ID);
  if (region) return region;

  region = document.createElement('div');
  region.id = LIVE_REGION_ID;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  // Visually hidden but still exposed to assistive tech (the standard
  // "clip" pattern — display:none/visibility:hidden would hide it from
  // screen readers too, defeating the point).
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.appendChild(region);
  return region;
}

/**
 * Announces `message` via the shared live region. Clears the region's
 * text first (on a microtask-length delay) before setting the new
 * message — most screen readers only announce an `aria-live` region when
 * its *text content changes*, so announcing the same message twice in a
 * row (e.g. "Block deleted" after two separate deletes) would otherwise
 * silently not fire the second time.
 */
export function announce(message) {
  const region = getOrCreateLiveRegion();
  if (!region) return;
  region.textContent = '';
  // setTimeout(0), not a microtask — needs to land in a separate paint/
  // AT-observation tick from the clear above for some screen readers to
  // register the change as new content rather than coalescing both writes
  // into one.
  setTimeout(() => {
    region.textContent = message;
  }, 0);
}
