import { describe, it, expect } from 'vitest';
import {
  normalizeRect,
  pointInRect,
  pointInEllipse,
  distanceToSegment,
  pointNearSegment,
  arrowheadPoints,
  diamondPoints,
  trianglePoints,
  starPoints,
  pointInPolygon,
  rotatePoint,
} from '../../src/blocks/canvas/shapeGeometry.js';

describe('normalizeRect', () => {
  it('handles a drag down-and-right (the "normal" direction) unchanged', () => {
    expect(normalizeRect(10, 20, 110, 220)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('handles a drag up-and-left, producing the same box', () => {
    expect(normalizeRect(110, 220, 10, 20)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('handles a drag down-and-left', () => {
    expect(normalizeRect(110, 20, 10, 220)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('handles a drag up-and-right', () => {
    expect(normalizeRect(10, 220, 110, 20)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('a zero-movement drag produces a zero-size box, not NaN/negative', () => {
    expect(normalizeRect(50, 50, 50, 50)).toEqual({ x: 50, y: 50, width: 0, height: 0 });
  });
});

describe('pointInRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it('is true for a point inside the box, including exactly on its edge', () => {
    expect(pointInRect(150, 150, rect)).toBe(true);
    expect(pointInRect(100, 100, rect)).toBe(true); // top-left corner
    expect(pointInRect(300, 200, rect)).toBe(true); // bottom-right corner
  });

  it('is false for a point outside the box', () => {
    expect(pointInRect(50, 50, rect)).toBe(false);
    expect(pointInRect(301, 150, rect)).toBe(false);
  });
});

describe('pointInEllipse', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }; // center (200,150), rx=100, ry=50

  it('is true for the center and false for a far corner of the bounding box (ellipse excludes box corners)', () => {
    expect(pointInEllipse(200, 150, rect)).toBe(true);
    expect(pointInEllipse(100, 100, rect)).toBe(false); // bounding-box corner, outside the inscribed ellipse
  });

  it('is true right at the edge along an axis', () => {
    expect(pointInEllipse(300, 150, rect)).toBe(true); // rightmost point of the ellipse
  });

  it('is false well outside the ellipse', () => {
    expect(pointInEllipse(0, 0, rect)).toBe(false);
  });

  it('degenerates to false (not NaN/throw) for a zero-size box', () => {
    expect(pointInEllipse(0, 0, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });
});

describe('distanceToSegment / pointNearSegment', () => {
  it('is zero distance for a point exactly on the segment', () => {
    expect(distanceToSegment(50, 0, 0, 0, 100, 0)).toBeCloseTo(0);
  });

  it('is the perpendicular distance for a point directly beside the segment', () => {
    expect(distanceToSegment(50, 10, 0, 0, 100, 0)).toBeCloseTo(10);
  });

  it('clamps to the nearest endpoint beyond the segment\'s ends, not the infinite line', () => {
    expect(distanceToSegment(150, 0, 0, 0, 100, 0)).toBeCloseTo(50); // 50 past the (100,0) end
    expect(distanceToSegment(-30, 0, 0, 0, 100, 0)).toBeCloseTo(30); // before the (0,0) start
  });

  it('handles a zero-length segment as a point-to-point distance', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });

  it('pointNearSegment respects the given tolerance boundary', () => {
    expect(pointNearSegment(50, 9, 0, 0, 100, 0, 10)).toBe(true);
    expect(pointNearSegment(50, 11, 0, 0, 100, 0, 10)).toBe(false);
  });
});

describe('arrowheadPoints', () => {
  it('plants the tip exactly at the end point', () => {
    const [tip] = arrowheadPoints(0, 0, 100, 0, 20);
    expect(tip).toEqual([100, 0]);
  });

  it('is symmetric around the segment\'s own direction for a horizontal arrow', () => {
    const [, back1, back2] = arrowheadPoints(0, 0, 100, 0, 20);
    // both back corners sit at the same x (behind the tip along the direction of travel), mirrored in y
    expect(back1[0]).toBeCloseTo(back2[0]);
    expect(back1[1]).toBeCloseTo(-back2[1]);
    expect(back1[0]).toBeLessThan(100); // behind the tip, not past it
  });

  it('does not throw / produce NaN for a zero-length segment', () => {
    const points = arrowheadPoints(50, 50, 50, 50, 20);
    expect(points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });
});

describe('diamondPoints', () => {
  it('returns the 4 edge-midpoints of the bounding box, in order', () => {
    const rect = { x: 100, y: 200, width: 100, height: 50 };
    expect(diamondPoints(rect)).toEqual([
      [150, 200], // top
      [200, 225], // right
      [150, 250], // bottom
      [100, 225], // left
    ]);
  });
});

describe('trianglePoints', () => {
  it('returns top-mid, bottom-right, bottom-left, inscribed in the bounding box', () => {
    const rect = { x: 100, y: 200, width: 100, height: 50 };
    expect(trianglePoints(rect)).toEqual([
      [150, 200],
      [200, 250],
      [100, 250],
    ]);
  });
});

describe('starPoints', () => {
  it('returns 2 * spikes vertices, starting at the top and alternating outer/inner radius', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const points = starPoints(rect, 5);
    expect(points).toHaveLength(10);
    // first point is the top spike: straight up from center (50,50), at the outer radius (50)
    expect(points[0][0]).toBeCloseTo(50);
    expect(points[0][1]).toBeCloseTo(0);
    // second point (inner) is closer to the center than the first (outer)
    const center = [50, 50];
    const distFromCenter = ([x, y]) => Math.hypot(x - center[0], y - center[1]);
    expect(distFromCenter(points[1])).toBeLessThan(distFromCenter(points[0]));
  });

  it('defaults to 5 spikes', () => {
    expect(starPoints({ x: 0, y: 0, width: 100, height: 100 })).toHaveLength(10);
  });
});

describe('pointInPolygon', () => {
  const square = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];

  it('is true for a point inside a simple polygon and false for one clearly outside', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 150, square)).toBe(false);
  });

  it('correctly excludes a point inside a diamond\'s bounding box but outside the diamond itself — the whole reason this replaces the bounding-box fallback', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const diamond = diamondPoints(rect);
    // (5,5) is in the box's top-left corner region — inside the bbox, but well outside the diamond (whose nearest edge there runs from (50,0) to (0,50))
    expect(pointInRect(5, 5, rect)).toBe(true);
    expect(pointInPolygon(5, 5, diamond)).toBe(false);
    // the diamond's own center is inside both
    expect(pointInPolygon(50, 50, diamond)).toBe(true);
  });

  it('works for a triangle', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const triangle = trianglePoints(rect);
    expect(pointInPolygon(50, 90, triangle)).toBe(true); // near the base, inside
    expect(pointInPolygon(5, 5, triangle)).toBe(false); // top-left corner of the bbox, outside the triangle
  });
});

describe('rotatePoint', () => {
  it('a 90-degree rotation around the origin maps (1,0) to (0,1) (clockwise, matching SVG rotate())', () => {
    const [x, y] = rotatePoint(1, 0, 0, 0, 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it('rotating around a non-origin center works the same relative to that center', () => {
    const [x, y] = rotatePoint(110, 100, 100, 100, 90);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(110);
  });

  it('the center point itself is a fixed point of any rotation', () => {
    const [x, y] = rotatePoint(50, 75, 50, 75, 137);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(75);
  });

  it('0 and 360 degrees are both no-ops', () => {
    expect(rotatePoint(30, 40, 10, 10, 0)).toEqual([30, 40]);
    const [x, y] = rotatePoint(30, 40, 10, 10, 360);
    expect(x).toBeCloseTo(30);
    expect(y).toBeCloseTo(40);
  });

  it('rotating by +angle then by -angle returns the original point', () => {
    const [rx, ry] = rotatePoint(70, 20, 15, 15, 42);
    const [x, y] = rotatePoint(rx, ry, 15, 15, -42);
    expect(x).toBeCloseTo(70);
    expect(y).toBeCloseTo(20);
  });
});
