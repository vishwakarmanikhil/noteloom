const DEFAULT_SIZE = 8;
const DEFAULT_THINNING = 0.5;
const DEFAULT_SMOOTHING = 0.5;
const TAPER_POINT_COUNT = 4;
const MIN_RADIUS_FACTOR = 0.15;
// "Speed" is approximated as raw distance between consecutive input samples
// (no real timestamps are captured/needed) — a reasonable proxy since
// pointermove sampling density is roughly constant for a given device, and
// this only needs to feel right, not model real velocity precisely. This is
// the normalized-space (0..1000) distance a step must cover to count as
// "fast enough to fully thin" the stroke.
const SPEED_NORM = 8;

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// Every pointer event handler in CanvasBlock.jsx falls back to a hardcoded
// `event.pressure || 0.5` when the input device reports no real pressure
// (true for every mouse and most touchscreens — only an actual
// pressure-sensitive stylus reports something else) — see the doc comment
// on `hasRealPressureVariation` below for what that default is used for.
const DEFAULT_PRESSURE = 0.5;

/**
 * Whether this stroke carries genuine pressure DATA — some point's pressure
 * differs from the plain default every non-stylus input device reports.
 * Only strokes with real variation get pressure-based width scaling in
 * `computeRadii` below; otherwise the overwhelmingly common case (mouse/
 * touch, no stylus) would ALWAYS render at a fraction of its own chosen
 * `size` — a stroke drawn at "width 20" looking visibly thinner than a
 * width-20 shape outline, which is exactly the mismatch this exists to
 * avoid. A real stylus's pressure data is trusted and still gets full
 * variable-width treatment, since that's genuinely useful, expected
 * behavior for that input method.
 */
export function hasRealPressureVariation(points) {
  return points.some(([, , pressure]) => pressure !== undefined && pressure !== DEFAULT_PRESSURE);
}

/**
 * One radius (half-width) per input point — a zero-dependency reimplementation
 * of perfect-freehand's most visually important trait, not a full port of its
 * configurable easing system. Blends a pressure-based base width with a
 * velocity-based thinning term (faster movement between consecutive samples
 * -> thinner ink), then tapers both ends of the whole stroke down toward a
 * point (the "comes to a point" look real ink/brushes have). Exported
 * directly so its shape (radius shrinks toward both ends relative to the
 * middle) is independently testable without parsing path-string geometry.
 *
 * ALL of that — pressure scaling, velocity thinning, AND end-taper — is
 * gated behind `hasRealPressureVariation`: without genuine stylus pressure
 * data (a mouse/touchscreen stroke, the overwhelmingly common case), the
 * radius is simply `size / 2` at every single point, full stop. A stroke
 * drawn at "width 20" must look exactly as wide as a width-20 shape
 * outline, everywhere along its length — not just "close" at rest with a
 * thinner middle whenever the cursor moved at a normal drawing speed
 * (thinning) or thinner tips (taper). Only a real stylus's pressure data
 * unlocks the full natural "ink" look these terms exist for.
 */
export function computeRadii(points, { size = DEFAULT_SIZE, thinning = DEFAULT_THINNING } = {}) {
  const baseRadius = size / 2;
  const n = points.length;
  const usePressure = hasRealPressureVariation(points);

  if (!usePressure) return new Array(n).fill(baseRadius);

  const radii = new Array(n);
  let speed = 0;

  for (let i = 0; i < n; i += 1) {
    if (i > 0) {
      const step = dist(points[i], points[i - 1]);
      speed = speed * 0.8 + step * 0.2;
    }
    const speedFactor = clamp(speed / SPEED_NORM, 0, 1);
    const pressure = points[i][2] ?? DEFAULT_PRESSURE;
    const pressureFactor = 0.4 + 0.6 * clamp(pressure, 0, 1);
    const radius = clamp(
      baseRadius * pressureFactor * (1 - thinning * speedFactor),
      baseRadius * MIN_RADIUS_FACTOR,
      baseRadius,
    );
    radii[i] = radius;
  }

  const taperCount = Math.min(TAPER_POINT_COUNT, Math.floor(n / 2));
  for (let i = 0; i < taperCount; i += 1) {
    const t = (i + 1) / (taperCount + 1); // ramps 0 (exclusive) -> 1 (exclusive)
    const factor = MIN_RADIUS_FACTOR + (1 - MIN_RADIUS_FACTOR) * t;
    radii[i] *= factor;
    radii[n - 1 - i] *= factor;
  }

  return radii;
}

/** Simple moving-average smoothing over the centerline (position only, never pressure) — removes visible raw-input jitter without any external dependency. Endpoints are left untouched so the stroke's start/end position is never shifted. */
function smoothPoints(points, smoothing) {
  const n = points.length;
  if (n < 3 || smoothing <= 0) return points;
  const result = new Array(n);
  result[0] = points[0];
  result[n - 1] = points[n - 1];
  for (let i = 1; i < n - 1; i += 1) {
    const midX = (points[i - 1][0] + points[i + 1][0]) / 2;
    const midY = (points[i - 1][1] + points[i + 1][1]) / 2;
    const x = points[i][0] + (midX - points[i][0]) * smoothing;
    const y = points[i][1] + (midY - points[i][1]) * smoothing;
    result[i] = [x, y, points[i][2]];
  }
  return result;
}

/** Left/right offset points at each centerline point, using a central-difference tangent (one-sided at the ends) rotated 90deg for the normal. */
function computeOffsets(points, radii) {
  const n = points.length;
  const left = new Array(n);
  const right = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty; // tangent rotated 90deg = normal
    const ny = tx;
    const r = radii[i];
    left[i] = [points[i][0] + nx * r, points[i][1] + ny * r];
    right[i] = [points[i][0] - nx * r, points[i][1] - ny * r];
  }
  return { left, right };
}

function pathFromPolygon(poly) {
  if (poly.length === 0) return '';
  let d = `M${round(poly[0][0])},${round(poly[0][1])}`;
  for (let i = 1; i < poly.length; i += 1) d += ` L${round(poly[i][0])},${round(poly[i][1])}`;
  return d;
}

/** A regular-polygon approximation of a filled circle, built from plain line segments (consistent with the rest of this module's "no bezier curves in v1" simplification) — used for a tap-without-drag, so a single click still leaves a visible mark. */
function dotPath([x, y], radius) {
  const sides = 12;
  const poly = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    poly.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
  }
  return `${pathFromPolygon(poly)} Z`;
}

/**
 * Builds an SVG path `d` string for one stroke's filled variable-width
 * outline, from raw `[x, y, pressure]` input points in the block's fixed
 * 0..1000 normalized coordinate space. This is the whole "ink" look: a
 * FILLED polygon (native `stroke-width` can't vary along a path), not a
 * stroked centerline.
 *
 * `size` is the stroke's full width at maximum thickness (radius = size/2);
 * `thinning` (0..1) controls how much faster movement thins the ink;
 * `smoothing` (0..1) controls how much the raw input jitter is smoothed out.
 */
export function getStrokeOutlinePath(rawPoints, options = {}) {
  const { size = DEFAULT_SIZE, thinning = DEFAULT_THINNING, smoothing = DEFAULT_SMOOTHING } = options;
  if (!rawPoints || rawPoints.length === 0) return '';

  // Drop consecutive near-duplicate points — avoids zero-length tangents/
  // divide-by-zero in computeOffsets, and can legitimately happen if the
  // pointer pauses mid-stroke without moving.
  const points = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i += 1) {
    if (dist(rawPoints[i], points[points.length - 1]) > 0.1) points.push(rawPoints[i]);
  }

  if (points.length === 1) {
    const pressure = points[0][2] ?? 0.5;
    const radius = (size / 2) * (0.4 + 0.6 * clamp(pressure, 0, 1));
    return dotPath(points[0], radius);
  }

  const radii = computeRadii(points, { size, thinning });
  const smoothed = smoothPoints(points, smoothing);
  const { left, right } = computeOffsets(smoothed, radii);

  const polygon = [...left, ...right.slice().reverse()];
  return `${pathFromPolygon(polygon)} Z`;
}

/** Plain min/max bounding box over raw points — reused by the eraser's hit-test (see canvasGeometry.js). */
export function strokeBoundingBox(points) {
  if (!points || points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
