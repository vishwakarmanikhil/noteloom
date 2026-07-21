/**
 * The `<svg>` keeps its default `preserveAspectRatio` ("xMidYMid meet"),
 * which scales a `size x size` SQUARE viewBox to fit inside the rendered
 * box UNIFORMLY (same factor on both axes) and CENTERS it — letterboxing
 * whichever axis is "too big" — rather than stretching each axis
 * independently to fill it. `width`/`height` (the block's own rendered
 * pixel size) default to 480x320, a non-square box, so this letterboxing is
 * the common case, not an edge case.
 *
 * A naive `(clientX - rect.left) / rect.width` (dividing by each axis'
 * OWN rendered dimension independently) ignores that letterbox offset
 * entirely — it's only correct when the rendered box happens to be exactly
 * square. Otherwise the cursor and the point actually drawn silently drift
 * apart, worse the more the rendered box's aspect ratio departs from
 * square. This replicates the browser's own "meet" math (one shared
 * `scale`, plus a centering offset on whichever axis has the extra space)
 * so the two always agree, for ANY rendered box shape.
 */
function computeViewTransform(svgEl, size) {
  const rect = svgEl.getBoundingClientRect();
  const rectWidth = rect.width || 1;
  const rectHeight = rect.height || 1;
  const scale = Math.min(rectWidth / size, rectHeight / size);
  const offsetX = (rectWidth - size * scale) / 2;
  const offsetY = (rectHeight - size * scale) / 2;
  return { rect, scale, offsetX, offsetY };
}

/**
 * Converts a pointer event's client coordinates into the block's fixed
 * 0..1000 normalized drawing space (see createCanvasBlock.js) — independent
 * of the SVG's own rendered pixel size, so drawing stays correct regardless
 * of how the block has been resized.
 *
 * `view` is the currently-visible window into that fixed space (pan/zoom —
 * see CanvasBlock.jsx's local, non-persisted `view` state): `{x, y}` is the
 * top-left corner currently shown and `size` is how much of the space is
 * visible across the SVG's full rendered width/height (matching whatever
 * `viewBox` the `<svg>` was actually given). Defaults to the whole
 * un-panned/un-zoomed space, so a caller that never introduces pan/zoom
 * (or a test that doesn't care about it) gets the exact same mapping as
 * before pan/zoom existed.
 */
export function clientToLocal(event, svgEl, view = { x: 0, y: 0, size: 1000 }) {
  const { rect, scale, offsetX, offsetY } = computeViewTransform(svgEl, view.size);
  const x = view.x + (event.clientX - rect.left - offsetX) / scale;
  const y = view.y + (event.clientY - rect.top - offsetY) / scale;
  return [x, y];
}

/**
 * How many local-space units correspond to one CSS pixel of the SVG's own
 * rendered box, at the given local `size` — used to convert a client-space
 * pixel DELTA (a pan drag's mouse movement) into a local-space delta,
 * without needing `clientToLocal`'s absolute `view.x`/`view.y` offset,
 * which a plain delta doesn't care about. Shares the exact same letterbox-
 * aware `scale` as `clientToLocal` so panning tracks the cursor 1:1
 * regardless of the rendered box's aspect ratio.
 */
export function localPixelScale(svgEl, size) {
  return computeViewTransform(svgEl, size).scale;
}

/**
 * Computes the next pan/zoom `view` (see CanvasBlock.jsx) that keeps the
 * point currently under the cursor fixed on screen as the zoom level
 * changes — the standard "zoom toward the cursor" behavior. `prevView` is
 * the view before this wheel tick; `nextSize` is the new (post-zoom) local
 * window size (`VIEW_SIZE / nextZoom`).
 */
export function zoomAnchoredView(event, svgEl, prevView, nextSize) {
  const [cursorLocalX, cursorLocalY] = clientToLocal(event, svgEl, prevView);
  const { rect, scale, offsetX, offsetY } = computeViewTransform(svgEl, nextSize);
  const x = cursorLocalX - (event.clientX - rect.left - offsetX) / scale;
  const y = cursorLocalY - (event.clientY - rect.top - offsetY) / scale;
  return { x, y };
}

/**
 * Computes the next pan/zoom view that keeps the CURRENT VIEW'S OWN CENTER
 * point fixed as zoom changes — the zoom in/out toolbar buttons' own
 * variant of `zoomAnchoredView` above, for when there's no cursor position
 * to anchor to (a button click, not a wheel event). Needs no DOM/event at
 * all, unlike `zoomAnchoredView` — it's pure arithmetic on the view itself.
 */
export function zoomCenteredView(prevView, nextSize) {
  const centerX = prevView.x + prevView.size / 2;
  const centerY = prevView.y + prevView.size / 2;
  return { x: centerX - nextSize / 2, y: centerY - nextSize / 2 };
}

/** True if two `{minX,minY,maxX,maxY}` boxes overlap, optionally padded outward by `padding` on both — used by the eraser's hit-test (a stroke's own half-width is a natural padding, so a thin eraser pass still catches thick ink). */
export function boxesIntersect(a, b, padding = 0) {
  return a.minX - padding <= b.maxX && a.maxX + padding >= b.minX && a.minY - padding <= b.maxY && a.maxY + padding >= b.minY;
}
