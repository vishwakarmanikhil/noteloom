import { genId } from '../../utils/idGen.js';

export const DEFAULT_CANVAS_WIDTH = 480;
export const DEFAULT_CANVAS_HEIGHT = 320;

/**
 * factory(parentId) -> {block, runs} for a freehand-drawing surface — a pure
 * "widget" block with no runs at all (contentIds always []), same shape as
 * divider/embed. `strokes` is an array of `{ id, points, color, size }`,
 * where `points` are raw `[x, y, pressure]` triples authored in a FIXED
 * 0..1000 normalized coordinate space, decoupled from `width`/`height` (the
 * block's own rendered pixel size) — resizing the block never has to touch
 * or rescale stroke data, it only changes how big that fixed space is drawn.
 *
 * `shapes` is a sibling array in that same fixed space — rectangle/ellipse
 * entries are `{ id, type, x, y, width, height, color, strokeWidth }`
 * (top-left + always-normalized-positive size), arrow entries are
 * `{ id, type: 'arrow', x1, y1, x2, y2, color, strokeWidth }` (two
 * endpoints; the arrowhead itself is derived at render time, not stored —
 * see shapeGeometry.js's `arrowheadPoints`).
 */
export function createCanvasBlock({
  strokes = [],
  shapes = [],
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
} = {}) {
  return function factory(parentId) {
    return {
      block: { id: genId(), type: 'canvas', parentId, contentIds: [], props: { strokes, shapes, width, height } },
      runs: [],
    };
  };
}
