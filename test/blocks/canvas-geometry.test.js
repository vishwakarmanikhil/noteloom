import { describe, it, expect } from 'vitest';
import { clientToLocal, localPixelScale, zoomAnchoredView, boxesIntersect } from '../../src/blocks/canvas/canvasGeometry.js';

// A plain object with just enough shape to stand in for the real <svg>
// element — clientToLocal/localPixelScale/zoomAnchoredView only ever call
// `.getBoundingClientRect()` on it, so no real DOM/jsdom rendering is needed
// to test this module's pure geometry math directly.
function fakeSvg(rect) {
  return { getBoundingClientRect: () => rect };
}

describe('clientToLocal: letterbox-aware mapping (regression — cursor/draw-point mismatch)', () => {
  it('maps the exact center of a SQUARE rendered box to the exact center of local space', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 400, height: 400 });
    const [x, y] = clientToLocal({ clientX: 200, clientY: 200 }, svg, { x: 0, y: 0, size: 1000 });
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(500);
  });

  it('maps the exact center of a NON-square rendered box to the exact center of local space too — this is the bug this module fixes', () => {
    // A naive (clientX/rect.width)*1000 mapping would put this well off-center
    // on the wider axis; the browser's own default preserveAspectRatio
    // ("xMidYMid meet") uniformly scales+centers instead, so this must too.
    const svg = fakeSvg({ left: 0, top: 0, width: 480, height: 320 });
    const [x, y] = clientToLocal({ clientX: 240, clientY: 160 }, svg, { x: 0, y: 0, size: 1000 });
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(500);
  });

  it('a point on the wider axis outside the letterboxed (shorter-axis-limited) content still maps consistently with the browser\'s own centering', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 480, height: 320 });
    // scale = min(480,320)/1000 = 0.32; offsetX = (480 - 1000*0.32)/2 = 80
    const [xAtLeftEdgeOfContent] = clientToLocal({ clientX: 80, clientY: 0 }, svg, { x: 0, y: 0, size: 1000 });
    expect(xAtLeftEdgeOfContent).toBeCloseTo(0); // the left edge of the actually-drawn square, not the rect's own left edge
  });

  it('is unaffected by view.x/view.y translation (pan) — same relative mapping, shifted by the pan offset', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 400, height: 400 });
    const [x, y] = clientToLocal({ clientX: 200, clientY: 200 }, svg, { x: 100, y: -50, size: 1000 });
    expect(x).toBeCloseTo(600);
    expect(y).toBeCloseTo(450);
  });
});

describe('localPixelScale', () => {
  it('matches the scale a square rect would use directly', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 400, height: 400 });
    expect(localPixelScale(svg, 1000)).toBeCloseTo(0.4);
  });

  it('uses the SMALLER of the two axes for a non-square rect (matching the browser\'s own letterboxing)', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 480, height: 320 });
    expect(localPixelScale(svg, 1000)).toBeCloseTo(0.32);
  });
});

describe('zoomAnchoredView', () => {
  it('keeps the point under the cursor fixed on screen across a zoom change', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 400, height: 400 });
    const prevView = { x: 0, y: 0, size: 1000 };
    const cursorEvent = { clientX: 100, clientY: 100 };
    const [beforeX, beforeY] = clientToLocal(cursorEvent, svg, prevView);

    const nextSize = 500; // zoomed in 2x
    const nextView = zoomAnchoredView(cursorEvent, svg, prevView, nextSize);
    const [afterX, afterY] = clientToLocal(cursorEvent, svg, { ...nextView, size: nextSize });

    expect(afterX).toBeCloseTo(beforeX);
    expect(afterY).toBeCloseTo(beforeY);
  });
});

describe('boxesIntersect', () => {
  it('detects overlap and non-overlap correctly, with optional padding', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(boxesIntersect(a, b)).toBe(false);
    expect(boxesIntersect(a, b, 15)).toBe(true); // padded close enough to touch
  });
});
