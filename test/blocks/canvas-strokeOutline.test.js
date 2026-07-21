import { describe, it, expect } from 'vitest';
import {
  getStrokeOutlinePath,
  computeRadii,
  strokeBoundingBox,
  hasRealPressureVariation,
} from '../../src/blocks/canvas/strokeOutline.js';

// Extracts the [x, y] pairs out of a `d` string built only from M/L segments
// (this module never emits curves) — good enough for geometric assertions
// without needing a real SVG path parser.
function parsePoints(d) {
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
}

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('getStrokeOutlinePath', () => {
  it('returns an empty string for no points', () => {
    expect(getStrokeOutlinePath([])).toBe('');
  });

  it('returns a closed, non-empty polygon path for a single point (a "dot")', () => {
    const d = getStrokeOutlinePath([[100, 100, 0.5]], { size: 10 });
    expect(d.startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    const points = parsePoints(d);
    expect(points.length).toBeGreaterThan(3); // a polygon approximation, not a degenerate point
    const box = bbox(points);
    expect(box.maxX - box.minX).toBeGreaterThan(0);
    expect(box.maxY - box.minY).toBeGreaterThan(0);
  });

  it('produces an outline noticeably wider than a zero-width line for a straight horizontal stroke', () => {
    const points = [
      [100, 500, 0.5],
      [300, 500, 0.5],
      [500, 500, 0.5],
      [700, 500, 0.5],
      [900, 500, 0.5],
    ];
    const size = 20;
    const d = getStrokeOutlinePath(points, { size });
    const box = bbox(parsePoints(d));
    // perpendicular (vertical) spread must reflect roughly the stroke size,
    // not be a zero-height line
    expect(box.maxY - box.minY).toBeGreaterThan(size * 0.2);
    // travels along x roughly the drawn distance
    expect(box.maxX - box.minX).toBeGreaterThan(700);
  });

  it('drops consecutive near-duplicate points without throwing (pointer paused mid-stroke)', () => {
    const points = [
      [100, 100, 0.5],
      [100, 100, 0.5],
      [100.01, 100.01, 0.5],
      [200, 200, 0.5],
    ];
    expect(() => getStrokeOutlinePath(points, { size: 8 })).not.toThrow();
  });
});

describe('computeRadii', () => {
  // Taper/thinning/pressure-scaling are all gated behind real pressure
  // DATA (see hasRealPressureVariation) — a uniform 0.5 (the plain mouse/
  // touch default) now renders at a flat, full-width radius everywhere
  // (see the dedicated test for that below), so these tests use a
  // non-default pressure (0.6) to keep exercising the actual taper/
  // thinning math on genuine "stylus" input.
  it('tapers the radius down toward both ends relative to the middle of a long straight stroke', () => {
    const points = Array.from({ length: 12 }, (_, i) => [i * 50, 0, 0.6]);
    const radii = computeRadii(points, { size: 20, thinning: 0 });
    const middle = radii[Math.floor(radii.length / 2)];
    expect(radii[0]).toBeLessThan(middle);
    expect(radii[radii.length - 1]).toBeLessThan(middle);
  });

  it('thins the radius for fast (widely-spaced) movement relative to slow movement, at the same pressure', () => {
    const slow = Array.from({ length: 8 }, (_, i) => [i * 2, 0, 0.6]); // tiny steps: "slow"
    const fast = Array.from({ length: 8 }, (_, i) => [i * 40, 0, 0.6]); // large steps: "fast"
    const slowRadii = computeRadii(slow, { size: 20, thinning: 0.8 });
    const fastRadii = computeRadii(fast, { size: 20, thinning: 0.8 });
    // compare an interior point, away from both this function's own taper
    // and the natural warm-up of the speed EMA at index 0
    const mid = 4;
    expect(fastRadii[mid]).toBeLessThan(slowRadii[mid]);
  });

  it('renders at a flat, full-width radius everywhere (no taper, no thinning) for plain mouse/touch input at ANY speed — not just at rest', () => {
    const fastMouseMove = Array.from({ length: 12 }, (_, i) => [i * 60, 0, 0.5]); // fast movement, uniform default pressure
    const radii = computeRadii(fastMouseMove, { size: 20, thinning: 0.9 });
    expect(radii.every((r) => r === 10)).toBe(true); // size/2, constant at every single point
  });

  it('gives higher pressure a larger radius at the same (zero) speed', () => {
    const lightPressure = [[0, 0, 0.1], [10, 0, 0.1], [20, 0, 0.1]];
    const heavyPressure = [[0, 0, 0.1], [10, 0, 0.9], [20, 0, 0.9]];
    const lightRadii = computeRadii(lightPressure, { size: 20, thinning: 0 });
    const heavyRadii = computeRadii(heavyPressure, { size: 20, thinning: 0 });
    expect(heavyRadii[1]).toBeGreaterThan(lightRadii[1]);
  });

  it('renders at the FULL nominal width for plain mouse/touch input (uniform default 0.5 pressure, zero speed) — matching a same-size shape outline, not a fraction of it', () => {
    const points = [[0, 0, 0.5], [0, 0, 0.5], [0, 0, 0.5]]; // zero movement -> exactly zero speedFactor
    const radii = computeRadii(points, { size: 20, thinning: 0.5 });
    expect(radii[1]).toBeCloseTo(10); // size/2, i.e. full width — not 0.7x like the old pressure-factor default
  });
});

describe('hasRealPressureVariation', () => {
  it('is false when every point reports the plain default (0.5) — a mouse/touchscreen stroke', () => {
    expect(hasRealPressureVariation([[0, 0, 0.5], [1, 1, 0.5], [2, 2, 0.5]])).toBe(false);
  });

  it('is true when any point reports something other than the default — real stylus pressure data', () => {
    expect(hasRealPressureVariation([[0, 0, 0.5], [1, 1, 0.9], [2, 2, 0.5]])).toBe(true);
  });

  it('is true for a uniformly-non-default pressure too (e.g. every point at 0.1)', () => {
    expect(hasRealPressureVariation([[0, 0, 0.1], [1, 1, 0.1]])).toBe(true);
  });
});

describe('strokeBoundingBox', () => {
  it('returns the exact min/max over a known point set', () => {
    const box = strokeBoundingBox([
      [10, 200, 0.5],
      [300, 5, 0.5],
      [150, 150, 0.5],
    ]);
    expect(box).toEqual({ minX: 10, minY: 5, maxX: 300, maxY: 200 });
  });

  it('returns a degenerate zero box for no points', () => {
    expect(strokeBoundingBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
