/**
 * Turns two drag corners (in either direction — the user may drag up/left
 * just as easily as down/right) into a valid, always-non-negative-size box.
 * Shared by both the live drag preview and the final commit, so a shape's
 * stored `{x, y, width, height}` is always in this normalized form —
 * `pointInRect`/rendering never has to handle a negative width/height.
 */
export function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x, y, width, height };
}

/**
 * Rotates `(px, py)` by `angleDeg` degrees (clockwise, matching SVG's own
 * `rotate()` transform convention) around `(cx, cy)`. Used both ways by the
 * rotate tool: to place a rotated shape's own handle/hit-test points in
 * screen space (forward), and to map a click point back into a rotated
 * shape's own unrotated local frame before running the ordinary
 * pointInRect/pointInEllipse/pointInPolygon tests (inverse — pass
 * `-angleDeg`).
 */
export function rotatePoint(px, py, cx, cy, angleDeg) {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** True if `(px, py)` falls anywhere inside `rect`'s bounding box. */
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * True if `(px, py)` falls inside the ellipse inscribed in `rect`'s
 * bounding box (standard `(dx/rx)^2 + (dy/ry)^2 <= 1` test) — matches what
 * is actually rendered (an `<ellipse>` inscribed in the same box a
 * rectangle would occupy), not just the box itself.
 */
export function pointInEllipse(px, py, rect) {
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  if (rx === 0 || ry === 0) return false;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

/**
 * Distance from `(px, py)` to the line segment `(x1,y1)-(x2,y2)`, clamped to
 * the segment (not the infinite line) — the standard "project onto the
 * segment, clamp t to [0,1]" formula. Used for the arrow tool's hit-test:
 * `pointNearSegment(...) <= tolerance`.
 */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.min(1, Math.max(0, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** `distanceToSegment(...) <= tolerance` — the arrow tool's own hit-test. */
export function pointNearSegment(px, py, x1, y1, x2, y2, tolerance) {
  return distanceToSegment(px, py, x1, y1, x2, y2) <= tolerance;
}

/** The 4 edge-midpoints of `rect`'s bounding box (top/right/bottom/left), in order — the vertices of the diamond inscribed in it. */
export function diamondPoints(rect) {
  const { x, y, width, height } = rect;
  return [
    [x + width / 2, y],
    [x + width, y + height / 2],
    [x + width / 2, y + height],
    [x, y + height / 2],
  ];
}

/**
 * The 3 vertices of a triangle inscribed in `rect`'s bounding box
 * (top-mid, bottom-right, bottom-left) — the shape behind the "polygon"
 * tool for this pass (a variable side-count control is out of scope). Not
 * necessarily equilateral unless the box happens to be square, same
 * "inscribed in the bounding box" convention `pointInEllipse` already uses
 * rather than a claim of geometric regularity.
 */
export function trianglePoints(rect) {
  const { x, y, width, height } = rect;
  return [
    [x + width / 2, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

/**
 * The `spikes * 2` vertices of a star polygon centered in `rect`'s bounding
 * box, alternating between the outer radius (the box's own half-width/
 * height) and a fixed inner radius (0.4x the outer one — no configurable
 * spike count/ratio in this pass), starting from the top and going
 * clockwise.
 */
export function starPoints(rect, spikes = 5) {
  const { x, y, width, height } = rect;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const outerRx = width / 2;
  const outerRy = height / 2;
  const innerRatio = 0.4;
  const points = [];
  const step = Math.PI / spikes;
  let angle = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i += 1) {
    const isOuter = i % 2 === 0;
    const rx = isOuter ? outerRx : outerRx * innerRatio;
    const ry = isOuter ? outerRy : outerRy * innerRatio;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    angle += step;
  }
  return points;
}

/**
 * Standard ray-casting point-in-polygon test — shared by every polygon-
 * based shape's hit-test (diamond, triangle, star, and any future one),
 * rather than a bespoke closed-form check per shape. `vertices` is a plain
 * `[[x,y], ...]` array, same shape every `*Points` function above returns.
 */
export function pointInPolygon(px, py, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    const crosses = yi > py !== yj > py;
    if (crosses && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The 3 points of a small filled triangle for an arrow's arrowhead, planted
 * at `(x2, y2)` (the arrow's end point) and oriented along the segment's
 * own direction — computed at render time from the two endpoints rather
 * than stored, the same "derive presentation from data" principle
 * `strokeOutline.js` already uses for stroke outlines. Degenerates to a
 * triangle pointing along the +x axis for a zero-length segment (start
 * and end coincide) rather than producing NaNs.
 */
export function arrowheadPoints(x1, y1, x2, y2, size = 24) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const [ux, uy] = length === 0 ? [1, 0] : [dx / length, dy / length];
  const backX = x2 - ux * size;
  const backY = y2 - uy * size;
  const nx = -uy;
  const ny = ux;
  const halfWidth = size / 2;
  return [
    [x2, y2],
    [backX + nx * halfWidth, backY + ny * halfWidth],
    [backX - nx * halfWidth, backY - ny * halfWidth],
  ];
}
