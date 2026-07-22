import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { useBlockClassName, useEditorStore } from '../../react/EditorProvider.jsx';
import { useOutsideClickAndEscape } from '../../react/useOutsideClickAndEscape.js';
import { updateBlockProps } from '../../store/operations.js';
import { genId } from '../../utils/idGen.js';
import { getStrokeOutlinePath, strokeBoundingBox } from './strokeOutline.js';
import { clientToLocal, boxesIntersect, localPixelScale, zoomAnchoredView, zoomCenteredView } from './canvasGeometry.js';
import {
  arrowheadPoints,
  normalizeRect,
  pointInRect,
  pointInEllipse,
  pointNearSegment,
  diamondPoints,
  trianglePoints,
  starPoints,
  pointInPolygon,
  rotatePoint,
} from './shapeGeometry.js';
import { useDragResize } from '../shared/useDragResize.js';
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from './createCanvasBlock.js';
import { buildCanvasSVGMarkup } from './exportSvg.js';
import {
  PencilIcon,
  XIcon,
  SquareIcon,
  CircleIcon,
  ArrowDiagonalIcon,
  CursorIcon,
  DiamondIcon,
  TriangleIcon,
  StarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TextIcon,
  MagnetIcon,
  DownloadIcon,
  EraserIcon,
} from '../../react/icons.jsx';

// The whole drawing surface is authored in this fixed logical space —
// `props.width`/`props.height` only control the SVG's *rendered* pixel
// size (the viewBox/rendered-size split below), never the coordinates
// stroke data is stored in. This is what makes resizing the block a pure
// "change how big this is drawn" operation that never touches `strokes`.
const VIEW_SIZE = 1000;

const DEFAULT_COLOR = '#1a1a1a';
const DEFAULT_STROKE_SIZE = 8;
// A small fixed palette, same spirit as FloatingToolbar's own text-color
// swatches — a pen stroke always needs a concrete color (no "Default"/null
// option the way text color has, since ink has to render as *something*).
const COLOR_SWATCHES = ['#1a1a1a', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
const MIN_STROKE_SIZE = 2;
const MAX_STROKE_SIZE = 40;
// Half-width of the eraser's own hit area, in the same fixed 0..1000
// normalized space strokes are authored in. Two selectable eraser modes
// (see the toolbar's own Eraser popover) share the exact same hit-test
// logic (`hitTestEraserAt`, erasing whole strokes/shapes it touches, never
// partial pixels) — they differ only in this radius: "Object Eraser" is
// deliberately generous (bigger than a typical pen stroke), forgiving to
// aim when you want to clear something out quickly; "Precise Eraser" uses
// a much smaller radius, for working close to other ink without
// accidentally sweeping up a neighboring stroke/shape. "Forgiving to aim"
// is about REACH (how close you need to get to a stroke), not precision,
// though — the actual hit-test (see `strokeNearPoint`) still only counts a
// stroke as touched where the eraser is actually near its real path, not
// merely somewhere inside its overall bounding box, regardless of mode.
const ERASER_RADIUS = 24;
const ERASER_RADIUS_PRECISE = 6;
const MIN_CANVAS_WIDTH = 160;
const MIN_CANVAS_HEIGHT = 120;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;
// Below this local-space drag distance (on either axis), a marquee drag is
// treated as a plain click instead — see commitMarquee.
const MARQUEE_MIN_DRAG = 4;
// How far a pasted/duplicated copy is offset from its source, in the same
// fixed 0..1000 normalized space — enough to be visibly distinct from the
// original without landing off a typically-visible canvas area.
const PASTE_OFFSET = 24;
// Arrow-key nudge step for the selection, in the same fixed 0..1000
// normalized space — Shift+arrow moves 10x further, the common "fine vs.
// coarse nudge" convention.
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;
const NUDGE_DELTAS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
// A freshly-placed text box's default size/font, in the same fixed
// 0..1000 normalized space — no auto-grow-to-fit-content or a dedicated
// font-size control in this pass (a deliberate v1 scope cut); the box can
// still be resized afterward via the same corner-drag every other shape
// already supports, since a text shape's `{x,y,width,height}` is the exact
// same shape those generic helpers already operate on.
const DEFAULT_TEXT_WIDTH = 220;
const DEFAULT_TEXT_HEIGHT = 60;
const DEFAULT_TEXT_FONT_SIZE = 28;
const MIN_TEXT_FONT_SIZE = 12;
const MAX_TEXT_FONT_SIZE = 96;

// Snapping (toggleable via the toolbar's magnet button, on by default): a
// plain fixed grid in the same 0..1000 normalized space — not "snap to
// other shapes' edges/centers" alignment guides, which is a substantially
// bigger feature (computing candidate lines from every other shape,
// rendering guide lines, etc.) explicitly out of scope for this pass.
// Applies to pointer DRAGS (draw/move/resize/rotate), which are imprecise
// by hand — not to arrow-key nudge, which is already exact.
const SNAP_GRID_SIZE = 10;
const SNAP_ROTATION_STEP = 15;
// The visible grid-dot spacing is coarser than SNAP_GRID_SIZE itself (a
// dot at every actual 10-unit snap line would be a dense, unhelpful wall
// of dots at this space's scale) — purely a visual reference for "this is
// what snapping aligns to," not a 1:1 rendering of every snap position.
const SNAP_GRID_VISUAL_SPACING = SNAP_GRID_SIZE * 5;

function snapValue(v) {
  return Math.round(v / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
}

function snapAngle(deg) {
  return Math.round(deg / SNAP_ROTATION_STEP) * SNAP_ROTATION_STEP;
}

/**
 * One stroke's outline path is pure/deterministic from its own `points`
 * (see strokeOutline.js) — cached by stroke object identity so committing a
 * NEW stroke (or resizing the block) never recomputes every other already-
 * drawn stroke's path, only whichever ones are new. Strokes are only ever
 * appended/replaced wholesale (never mutated in place — see
 * createCanvasBlock.js's doc comment), so identity-based caching is safe.
 *
 * A `WeakMap`, not a `Map` — a long editing session's erases/undo-redo
 * cycles replace/drop stroke objects constantly, and a plain `Map` would
 * hold every one of them (and its computed path string) forever, since
 * nothing ever deleted old entries: an unbounded memory leak that grows
 * with total strokes EVER drawn in the session, not just the current
 * count. A `WeakMap` holds its keys weakly, so once a stroke is no longer
 * referenced anywhere else (dropped from `props.strokes` AND far enough
 * out of undo/redo history), its cache entry becomes collectible
 * automatically — no manual pruning needed.
 */
function useStrokePathCache() {
  const cacheRef = useRef(new WeakMap());
  return (stroke) => {
    const cache = cacheRef.current;
    let path = cache.get(stroke);
    if (path === undefined) {
      path = getStrokeOutlinePath(stroke.points, { size: stroke.size });
      cache.set(stroke, path);
    }
    return path;
  };
}

function pointBox(x, y, r) {
  return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
}

/** The average client position of every currently-down touch pointer — the anchor point a two-finger pan drag tracks (see touchPanRef in CanvasBlock). */
function touchCentroid(pointsMap) {
  let sumX = 0;
  let sumY = 0;
  for (const point of pointsMap.values()) {
    sumX += point.x;
    sumY += point.y;
  }
  const count = pointsMap.size || 1;
  return { x: sumX / count, y: sumY / count };
}

/**
 * Whether `(x, y)` falls within `tolerance` of the ACTUAL stroke path — its
 * real polyline segments (or, for a single-point "dot" stroke, that one
 * point) — rather than just its bounding box. The eraser's own hit-test
 * uses this as the final decision (after `boxesIntersect` against
 * `strokeBoundingBox` as a cheap pre-filter, since this per-segment walk is
 * more expensive): a bounding box alone is only tight for a straight
 * stroke — an L-shaped or diagonal one has real empty space inside its own
 * box that the eraser shouldn't be able to trigger on, which is exactly
 * the "eraser erases things it never actually touched" imprecision this
 * replaces.
 */
function strokeNearPoint(stroke, x, y, tolerance) {
  const points = stroke.points;
  if (points.length === 1) {
    const [px, py] = points[0];
    return Math.hypot(x - px, y - py) <= tolerance;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (pointNearSegment(x, y, x1, y1, x2, y2, tolerance)) return true;
  }
  return false;
}

const SHAPE_TOOLS = new Set(['rectangle', 'ellipse', 'arrow', 'diamond', 'triangle', 'star']);

/** Maps a polygon-based shape type to its own vertex-generator function (see shapeGeometry.js) — the one place that association lives, reused by both rendering and hit-testing. */
const POLYGON_POINTS_BY_TYPE = { diamond: diamondPoints, triangle: trianglePoints, star: starPoints };

/** The 6 shape tools, folded into one popover (see the toolbar JSX) rather than 6 always-visible buttons — Pen/Select stay individual buttons since those are used far more often; Eraser gets its own small popover too (see ERASER_MODE_LIST) since it now has 2 modes. */
const SHAPE_TOOL_LIST = [
  { type: 'rectangle', label: 'Rectangle', Icon: SquareIcon },
  { type: 'ellipse', label: 'Ellipse', Icon: CircleIcon },
  { type: 'arrow', label: 'Arrow', Icon: ArrowDiagonalIcon },
  { type: 'diamond', label: 'Diamond', Icon: DiamondIcon },
  { type: 'triangle', label: 'Triangle', Icon: TriangleIcon },
  { type: 'star', label: 'Star', Icon: StarIcon },
];

/**
 * The 2 eraser modes, folded into one popover (mirroring SHAPE_TOOL_LIST's
 * own pattern). Object Eraser removes whichever WHOLE stroke/shape it
 * touches, same as a real "select and delete." Precise Eraser removes only
 * the individual POINTS of a stroke it actually passes over — like a real
 * pencil eraser, it can rub out just the middle of a line and leave the
 * two remaining ends behind as separate strokes (see `splitStrokePoints`
 * and `hitTestEraserAt`'s own doc comment) — plus uses a smaller hit
 * radius (ERASER_RADIUS_PRECISE vs ERASER_RADIUS) for working close to
 * other ink. Shapes have no per-point path to partially erase, so BOTH
 * modes remove a touched shape whole — Precise mode's only difference for
 * shapes is the smaller radius.
 */
const ERASER_MODE_LIST = [
  { mode: 'object', label: 'Object Eraser', Icon: EraserIcon },
  { mode: 'precise', label: 'Precise Eraser', Icon: XIcon },
];

/**
 * Turns an in-progress drag draft (`{ type, x1, y1, x2, y2 }`) into the same
 * shape-object shape `ShapeElement` and a committed `props.shapes` entry
 * both use — shared by the live preview and the final commit so they're
 * guaranteed to render identically (see `normalizeRect`'s own doc comment
 * for why rectangle/ellipse always come out non-negative regardless of
 * drag direction).
 */
function buildDraftShape(draft, color, strokeWidth, fillColor) {
  if (draft.type === 'arrow') {
    return { type: 'arrow', x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2, color, strokeWidth };
  }
  return { type: draft.type, ...normalizeRect(draft.x1, draft.y1, draft.x2, draft.y2), color, strokeWidth, fillColor };
}

// Generous hit-test tolerance for the arrow tool (a thin line is otherwise
// hard to click precisely), in the same fixed 0..1000 normalized space —
// same spirit as the eraser's own deliberately-forgiving ERASER_RADIUS.
const ARROW_HIT_TOLERANCE = 16;

/**
 * Which shape (if any) the select tool's pointerdown landed on — walked in
 * reverse (last-drawn/topmost first) so overlapping shapes resolve to
 * whichever one visually renders on top, matching how every other "click
 * to select" surface behaves. Rectangle/ellipse hit-test their whole
 * bounding box (see shapeGeometry.js's own doc comment on `pointInRect`/
 * `pointInEllipse` for why — a deliberate v1 simplification for unfilled
 * shapes); arrow hit-tests a tolerance band around its line segment.
 * Diamond/triangle/star hit-test their own precise polygon (see
 * shapeGeometry.js's `pointInPolygon`) rather than falling back to the
 * bounding box — unlike a rectangle, their box has substantial area
 * outside the actual shape (e.g. a diamond's 4 corner triangles) that a
 * bounding-box test would wrongly treat as "inside."
 */
function hitTestShapeAt(x, y, shapes) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i];
    if (shape.type === 'arrow') {
      if (pointNearSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2, ARROW_HIT_TOLERANCE)) return shape.id;
      continue;
    }
    const rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    // A rotated shape is rendered rotated (see ShapeElement) but stored in
    // its own unrotated `x/y/width/height` — map the click point back into
    // that unrotated local frame (inverse rotation around the shape's own
    // center) before running the ordinary tests below, rather than teaching
    // every one of those tests about rotation individually.
    let [testX, testY] = [x, y];
    if (shape.rotation) {
      const { cx, cy } = shapeCenter(shape);
      [testX, testY] = rotatePoint(x, y, cx, cy, -shape.rotation);
    }
    const pointsFn = POLYGON_POINTS_BY_TYPE[shape.type];
    let hit;
    if (pointsFn) hit = pointInPolygon(testX, testY, pointsFn(rect));
    else hit = shape.type === 'ellipse' ? pointInEllipse(testX, testY, rect) : pointInRect(testX, testY, rect);
    if (hit) return shape.id;
  }
  return null;
}

/** Translates a shape by `(dx, dy)` — used both to commit a finished move and to render its live in-progress preview. */
function applyShapeOffset(shape, dx, dy) {
  if (shape.type === 'arrow') {
    return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

/** A shape's own bounding box, regardless of type — used to size the selection overlay. */
function shapeBoundingBox(shape) {
  if (shape.type === 'arrow') {
    return {
      x: Math.min(shape.x1, shape.x2),
      y: Math.min(shape.y1, shape.y2),
      width: Math.abs(shape.x2 - shape.x1),
      height: Math.abs(shape.y2 - shape.y1),
    };
  }
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

/** A shape's own rotation center — the midpoint of its bounding box, the same pivot `ShapeElement`'s `rotate()` transform uses. Arrows are never rotated (see the component doc comment on rotation's scope), so this is only meaningful for rect/ellipse/diamond/triangle/star. */
function shapeCenter(shape) {
  const box = shapeBoundingBox(shape);
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Translates a stroke's every point by `(dx, dy)` — the multi-select move drag's own analogue of `applyShapeOffset`, used both to commit a finished group move and to render its live preview. */
function applyStrokeOffset(stroke, dx, dy) {
  return { ...stroke, points: stroke.points.map(([x, y, pressure]) => [x + dx, y + dy, pressure]) };
}

/**
 * The Precise Eraser's own commit step: splits a stroke's points AROUND
 * whichever indices were erased, into one run per surviving contiguous
 * group — a real pencil-eraser "rub out just this part" result, not a
 * whole-stroke delete. Returns an array of point arrays (each with >=1
 * point); an empty array means every point was erased, so the stroke
 * disappears entirely. `commitErase` gives the FIRST resulting run the
 * stroke's own original id (so an edit that doesn't actually split
 * anything — erasing only from one end — doesn't need a new id) and a
 * fresh id for every additional run a split in the MIDDLE produces.
 */
function splitStrokePoints(points, erasedIndices) {
  const runs = [];
  let current = [];
  for (let i = 0; i < points.length; i += 1) {
    if (erasedIndices.has(i)) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** A stroke's own bounding box, in the same `{x,y,width,height}` shape `shapeBoundingBox` returns (rather than strokeOutline.js's own `{minX,minY,maxX,maxY}`), so both selectable kinds share one rendering/hit-test code path. */
function strokeBoxRect(stroke) {
  const box = strokeBoundingBox(stroke.points);
  return { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
}

/** Either selectable kind's own bounding box, in `{x,y,width,height}` form. */
function selectableBoundingBox(kind, item) {
  return kind === 'stroke' ? strokeBoxRect(item) : shapeBoundingBox(item);
}

/**
 * Resolves a multi-select id to whichever of `strokes`/`shapes` it belongs
 * to — an id may be either, since multi-select spans both arrays (see the
 * component doc comment on the "select" tool below).
 */
function findSelectable(block, selId) {
  const strokes = block?.props?.strokes ?? [];
  const shapes = block?.props?.shapes ?? [];
  const stroke = strokes.find((s) => s.id === selId);
  if (stroke) return { kind: 'stroke', item: stroke };
  const shape = shapes.find((s) => s.id === selId);
  if (shape) return { kind: 'shape', item: shape };
  return null;
}

/**
 * Which stroke or shape (if any) the select tool's pointerdown landed on.
 * Shapes are checked first since they render on top of strokes (see the JSX
 * below — strokes are drawn before shapes, so shapes are visually
 * topmost); within shapes, `hitTestShapeAt` already walks topmost-first.
 * Strokes fall back to their own bounding-box hit test — the same
 * deliberate v1 simplification rectangle/ellipse already use, not
 * per-point path distance.
 */
function hitTestSelectableAt(x, y, strokes, shapes) {
  const shapeId = hitTestShapeAt(x, y, shapes);
  if (shapeId) return { kind: 'shape', id: shapeId };
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    const stroke = strokes[i];
    if (pointInRect(x, y, strokeBoxRect(stroke))) return { kind: 'stroke', id: stroke.id };
  }
  return null;
}

// Generous hit radius for grabbing a resize/endpoint handle, and its own
// visual size — both in the same fixed 0..1000 normalized space everything
// else here uses (so handles scale naturally with zoom, same as stroke
// widths already do).
const HANDLE_HIT_RADIUS = 24;
const HANDLE_VISUAL_SIZE = 14;

/** The 4 corner points of a rectangle/ellipse shape's own bounding box, keyed by compass corner. */
function rectCorners(shape) {
  return {
    nw: [shape.x, shape.y],
    ne: [shape.x + shape.width, shape.y],
    sw: [shape.x, shape.y + shape.height],
    se: [shape.x + shape.width, shape.y + shape.height],
  };
}

const OPPOSITE_CORNER = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

// How far above the shape's own (unrotated) top edge the rotate handle
// floats, in the same fixed 0..1000 normalized space as everything else.
const ROTATE_HANDLE_OFFSET = 32;

/**
 * The rotate handle's own position — a fixed distance above the shape's
 * unrotated bounding-box top-center, then rotated around the shape's own
 * center by its current `rotation` so the handle visually stays attached
 * as the shape spins (same "computed from stored state, not itself stored"
 * principle as arrowheadPoints). Arrows are never rotated (see the
 * component doc comment on rotation's scope), so this is only meaningful
 * for rect/ellipse/diamond/triangle/star.
 */
function rotateHandlePoint(shape) {
  const box = shapeBoundingBox(shape);
  const localX = box.x + box.width / 2;
  const localY = box.y - ROTATE_HANDLE_OFFSET;
  if (!shape.rotation) return [localX, localY];
  const { cx, cy } = shapeCenter(shape);
  return rotatePoint(localX, localY, cx, cy, shape.rotation);
}

/**
 * Which resize/endpoint/rotate handle (if any) `(x, y)` landed on, for the
 * CURRENTLY SELECTED shape only (handles for every other shape are neither
 * rendered nor hit-tested) — checked before the general
 * `hitTestShapeAt` body hit-test, so grabbing a handle always takes
 * priority over re-selecting/moving the shape it belongs to. The rotate
 * handle is checked first since it sits outside the shape's own bounding
 * box, never overlapping a corner handle. Corner resize handles are hidden
 * (and un-hit-testable) once a shape has any rotation — see the component
 * doc comment on rotation's scope: no rotated-resize math in this pass.
 */
function hitTestHandle(x, y, shape) {
  if (!shape) return null;
  if (shape.type === 'arrow') {
    if (Math.hypot(x - shape.x1, y - shape.y1) <= HANDLE_HIT_RADIUS) return 'start';
    if (Math.hypot(x - shape.x2, y - shape.y2) <= HANDLE_HIT_RADIUS) return 'end';
    return null;
  }
  const [rhx, rhy] = rotateHandlePoint(shape);
  if (Math.hypot(x - rhx, y - rhy) <= HANDLE_HIT_RADIUS) return 'rotate';
  if (shape.rotation) return null;
  for (const [corner, [cx, cy]] of Object.entries(rectCorners(shape))) {
    if (Math.hypot(x - cx, y - cy) <= HANDLE_HIT_RADIUS) return corner;
  }
  return null;
}

/**
 * Builds the live (or final, at commit time) resized/endpoint-dragged/
 * rotated shape from an in-progress resize draft — `normalizeRect` (the
 * same function that turns a fresh rectangle/ellipse drag into a valid
 * box, see `buildDraftShape`) does the real work for the corner-drag case:
 * dragging ANY corner is just "normalize a box between the fixed opposite
 * corner and wherever the pointer currently is," so no separate per-corner
 * math is needed. The rotate case just reuses whatever angle
 * `handlePointerMove` already computed onto the draft (see its own
 * 'rotate'-mode branch) — this function's only job there is picking it off
 * the draft into the shape.
 */
function buildResizedShape(shape, draft) {
  if (draft.mode === 'arrow-endpoint') {
    return draft.endpoint === 'start' ? { ...shape, x1: draft.x, y1: draft.y } : { ...shape, x2: draft.x, y2: draft.y };
  }
  if (draft.mode === 'rotate') {
    return { ...shape, rotation: draft.rotation };
  }
  return { ...shape, ...normalizeRect(draft.fixedX, draft.fixedY, draft.x, draft.y) };
}

/**
 * Renders one shape (rectangle, ellipse, arrow, text, or a polygon type) —
 * reused for both a committed `props.shapes` entry and the in-progress
 * drag preview, so the live preview and the final render are guaranteed to
 * look identical (same component, same props shape). `fillColor` (rect/
 * ellipse/diamond/triangle/star only) defaults to `fill="none"` when unset
 * — arrows have no fill of their own (their arrowhead polygon is always
 * solid-filled with the stroke color, not a separate fill), and text uses
 * `color` for its own text color rather than a fill. A non-zero `rotation`
 * (rect/ellipse/diamond/triangle/star/text — arrows are never rotated, see
 * the component doc comment on rotation's scope) wraps the shape in a `<g>`
 * with an SVG `rotate()` transform around its own bounding-box center — the
 * exact pivot `shapeCenter`/`rotatePoint`-based hit-testing and the rotate
 * handle's own position both use, so click-select and the handle stay
 * visually in sync with what this renders.
 */
function ShapeElement({ shape, opacity = 1 }) {
  const strokeWidth = shape.strokeWidth ?? DEFAULT_STROKE_SIZE;
  let content;
  if (shape.type === 'rectangle') {
    content = (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fillColor ?? 'none'}
        stroke={shape.color}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  } else if (shape.type === 'ellipse') {
    content = (
      <ellipse
        cx={shape.x + shape.width / 2}
        cy={shape.y + shape.height / 2}
        rx={shape.width / 2}
        ry={shape.height / 2}
        fill={shape.fillColor ?? 'none'}
        stroke={shape.color}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  } else if (shape.type === 'arrow') {
    const headSize = Math.max(16, strokeWidth * 3);
    const head = arrowheadPoints(shape.x1, shape.y1, shape.x2, shape.y2, headSize);
    return (
      <g opacity={opacity}>
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} strokeWidth={strokeWidth} />
        <polygon points={head.map(([x, y]) => `${x},${y}`).join(' ')} fill={shape.color} />
      </g>
    );
  } else if (shape.type === 'text') {
    // A <foreignObject> + plain HTML <div> gets real browser text
    // wrapping/line-breaking for free — reimplementing that in raw SVG
    // <text>/<tspan> layout is a lot of work for no benefit here. No
    // auto-grow-to-fit: overflow is clipped to the box, same "resize the
    // box yourself" convention as every other shape's fixed bounding box.
    content = (
      <foreignObject x={shape.x} y={shape.y} width={shape.width} height={shape.height} opacity={opacity}>
        <div
          // eslint-disable-next-line react/no-unknown-property
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            color: shape.color,
            fontSize: shape.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
            lineHeight: 1.3,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
          }}
        >
          {shape.text}
        </div>
      </foreignObject>
    );
  } else {
    const pointsFn = POLYGON_POINTS_BY_TYPE[shape.type];
    if (!pointsFn) return null;
    const rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    const points = pointsFn(rect)
      .map(([x, y]) => `${x},${y}`)
      .join(' ');
    content = (
      <polygon points={points} fill={shape.fillColor ?? 'none'} stroke={shape.color} strokeWidth={strokeWidth} opacity={opacity} />
    );
  }
  if (!shape.rotation) return content;
  const { cx, cy } = shapeCenter(shape);
  return <g transform={`rotate(${shape.rotation} ${cx} ${cy})`}>{content}</g>;
}

/**
 * A pure "widget" block — no runs/text at all (contentIds always []), same
 * shape as DividerBlock/EmbedBlock — so it participates in cross-block
 * select/copy/cut/delete for free via the exact same generic mechanisms
 * those already exercise (see `src/blocks/shared/contentless.js`): a
 * canvas block backspaced-into from a neighboring paragraph behaves exactly
 * like an image/divider would, with zero canvas-specific code needed for
 * that lifecycle.
 *
 * Renders every committed stroke as one filled `<path>` (see
 * strokeOutline.js) inside an SVG whose `viewBox` is the fixed logical
 * VIEW_SIZE space and whose `width`/`height` attributes are the block's own
 * rendered pixel size (`props.width`/`props.height`).
 *
 * Both tools below share the same "local state/refs during the gesture,
 * exactly ONE store write on release" discipline (mirroring EmbedBlock.jsx's
 * resize-drag convention, adapted to native Pointer Events +
 * `setPointerCapture` instead of document-level mouse listeners):
 *
 * - **Pen** (Phase 2): raw `[x, y, pressure]` points accumulate in
 *   `pointsRef` on every `pointermove` — a plain ref mutation, never itself
 *   a React state update or a store write. The in-progress stroke's visual
 *   preview updates only via a `requestAnimationFrame`-throttled
 *   `previewPath` state (capped at ~60 recomputes/sec regardless of
 *   pointermove frequency). `pointerup` makes the one real commit: appends
 *   the finished stroke via `updateBlockProps`.
 * - **Eraser** (Phase 3): whole-object removal (strokes AND shapes alike),
 *   not pixel erasing — 2 selectable modes (see ERASER_MODE_LIST) share
 *   this whole discipline and differ only in hit radius. Each pointermove
 *   hit-tests the eraser's small local radius against every not-yet-erased
 *   stroke's ACTUAL path (`strokeNearPoint`, walking its real segments —
 *   not just its bounding box, which a diagonal or L-shaped stroke has real
 *   empty space inside of) and every not-yet-erased shape's bounding box,
 *   marking touched ids in `erasedStrokeIdsRef`/`erasedShapeIdsRef` (refs,
 *   not store writes) — a cheap `boxesIntersect` bounding-box pre-filter
 *   (see strokeOutline.js's `strokeBoundingBox`) skips the more expensive
 *   per-segment walk for strokes nowhere near the eraser at all. The
 *   rAF-throttled `erasingIds`/`erasingShapeIds` state only drives a live
 *   fade-out preview. `pointerup` makes the one commit: `strokes` AND
 *   `shapes` each filtered to drop every touched id, in a single
 *   `updateBlockProps` call — a whole erase drag removing N objects is
 *   still just one undo step, same discipline as pen.
 *
 * Pan/zoom (Phase 5) is plain LOCAL component state (`view`), never written
 * through `updateBlockProps` and never undo-tracked — it's a viewport
 * preference ("where am I currently looking"), not document content, the
 * same reasoning as why no block in this codebase persists a scroll
 * position. Applied purely via the `<svg>`'s own `viewBox` attribute, so
 * stroke coordinates themselves are never touched by panning/zooming.
 * Zoom is Ctrl/Cmd+wheel — also how a trackpad OR touchscreen pinch
 * gesture reports itself. Pan is: a middle-mouse-button drag (a plain,
 * always-available gesture that doesn't depend on which tool is currently
 * active or on keyboard focus, unlike a space-bar-held convention would);
 * a plain (non-ctrl) wheel, i.e. a trackpad's two-finger scroll; or two
 * fingers dragging on a touchscreen (see touchPanRef/cancelActiveSingleGesture) —
 * the latter takes over from whatever the first finger alone had already
 * started (drawing, erasing, ...) the instant a second finger touches down.
 */
export function CanvasBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const className = useBlockClassName('be-canvas', block);
  const getStrokePath = useStrokePathCache();

  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'select' | 'text' | one of SHAPE_TOOLS — ephemeral UI state, not persisted (same reasoning as pan/zoom: an authoring detail, not document content)
  // Which eraser mode is active (see ERASER_MODE_LIST/ERASER_RADIUS*'s own
  // doc comments) — remembered the same way `lastShapeTool` is, so the
  // Eraser popover's trigger button always shows a meaningful icon.
  const [eraserMode, setEraserMode] = useState('object');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState(DEFAULT_STROKE_SIZE);
  // Fill color for NEW rect/ellipse/diamond/triangle/star shapes — `null`
  // means "no fill" (`fill="none"`, today's only behavior before this
  // control existed, and still the default). Arrows have no fill (they're
  // inherently linear) and text uses `color` for its own text color, so
  // neither reads this. Same "tool default, not retroactive to an already-
  // selected shape" scope as `color`/`strokeSize` — changing it only
  // affects shapes drawn from then on.
  const [fill, setFill] = useState(null);
  // Grid snapping, on by default — toggled via the toolbar's magnet
  // button. Ephemeral UI state, not persisted, same reasoning as `tool`.
  const [snapEnabled, setSnapEnabled] = useState(true);
  // Font size for the text tool — same "tool default for the NEXT new
  // box" scope as color/strokeSize/fill, EXCEPT while a text box is
  // actively being edited (`textEditDraft` set): the size picker's
  // onChange then also live-updates that draft's own fontSize directly
  // (see its JSX below), since seeing the effect immediately while typing
  // is far more useful than only affecting boxes placed afterward.
  const [textFontSize, setTextFontSize] = useState(DEFAULT_TEXT_FONT_SIZE);
  // Remembers whichever shape tool was picked most recently, so the shape
  // popover's own trigger button can show a meaningful icon (and so
  // re-clicking a would-be "repeat last shape" affordance would have
  // something to repeat) even while Pen/Eraser/Select is the active tool.
  const [lastShapeTool, setLastShapeTool] = useState('rectangle');

  // Color/size/shape pickers: small inline popovers (position:relative
  // wrapper + position:absolute popover, same convention as
  // FloatingToolbar's own text-color/highlight pickers) rather than a
  // portaled menu — these are small pickers anchored to a toolbar that's
  // always already inside the document's normal flow, not a standalone
  // floating menu that needs viewport-overflow handling of its own.
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFillPickerOpen, setIsFillPickerOpen] = useState(false);
  const [isSizePickerOpen, setIsSizePickerOpen] = useState(false);
  const [isShapePickerOpen, setIsShapePickerOpen] = useState(false);
  const [isFontSizePickerOpen, setIsFontSizePickerOpen] = useState(false);
  const [isEraserPickerOpen, setIsEraserPickerOpen] = useState(false);
  const colorTriggerRef = useRef(null);
  const colorPopoverRef = useRef(null);
  const fillTriggerRef = useRef(null);
  const fillPopoverRef = useRef(null);
  const sizeTriggerRef = useRef(null);
  const sizePopoverRef = useRef(null);
  const shapeTriggerRef = useRef(null);
  const shapePopoverRef = useRef(null);
  const fontSizeTriggerRef = useRef(null);
  const fontSizePopoverRef = useRef(null);
  const eraserTriggerRef = useRef(null);
  const eraserPopoverRef = useRef(null);
  const colorRefs = useMemo(() => [colorTriggerRef, colorPopoverRef], []);
  const fillRefs = useMemo(() => [fillTriggerRef, fillPopoverRef], []);
  const sizeRefs = useMemo(() => [sizeTriggerRef, sizePopoverRef], []);
  const shapeRefs = useMemo(() => [shapeTriggerRef, shapePopoverRef], []);
  const fontSizeRefs = useMemo(() => [fontSizeTriggerRef, fontSizePopoverRef], []);
  const eraserRefs = useMemo(() => [eraserTriggerRef, eraserPopoverRef], []);
  const closeColorPicker = useCallback(() => setIsColorPickerOpen(false), []);
  const closeFillPicker = useCallback(() => setIsFillPickerOpen(false), []);
  const closeSizePicker = useCallback(() => setIsSizePickerOpen(false), []);
  const closeShapePicker = useCallback(() => setIsShapePickerOpen(false), []);
  const closeFontSizePicker = useCallback(() => setIsFontSizePickerOpen(false), []);
  const closeEraserPicker = useCallback(() => setIsEraserPickerOpen(false), []);
  useOutsideClickAndEscape(colorRefs, isColorPickerOpen, closeColorPicker);
  useOutsideClickAndEscape(fillRefs, isFillPickerOpen, closeFillPicker);
  useOutsideClickAndEscape(sizeRefs, isSizePickerOpen, closeSizePicker);
  useOutsideClickAndEscape(shapeRefs, isShapePickerOpen, closeShapePicker);
  useOutsideClickAndEscape(fontSizeRefs, isFontSizePickerOpen, closeFontSizePicker);
  useOutsideClickAndEscape(eraserRefs, isEraserPickerOpen, closeEraserPicker);

  const svgRef = useRef(null);
  const pointsRef = useRef([]);
  const drawingRef = useRef(false);
  const rafRef = useRef(null);
  const [previewPath, setPreviewPath] = useState(null);

  // Separate sets for strokes vs. shapes — both kinds are erasable (in
  // either mode), but live in different `props` arrays, so touched ids
  // need to be tracked (and later filtered out) per kind.
  const erasedStrokeIdsRef = useRef(new Set());
  const erasedShapeIdsRef = useRef(new Set());
  // Precise Eraser only: which POINT INDICES within each touched stroke
  // were erased — Object Eraser never touches this, it only ever removes
  // whole strokes/shapes via the two Sets above. Shapes have no per-point
  // path to partially erase, so Precise mode still removes a touched shape
  // whole (via erasedShapeIdsRef, just with the smaller radius) — a
  // deliberate, unavoidable-given-the-data-model scope decision.
  const erasedPointIndicesRef = useRef(new Map());
  const erasingRef = useRef(false);
  const eraseRafRef = useRef(null);
  const [erasingIds, setErasingIds] = useState(() => new Set());
  const [erasingShapeIds, setErasingShapeIds] = useState(() => new Set());

  // Shape tools (rectangle/ellipse/arrow): same "ref buffer during the
  // drag, one commit on pointerup" discipline as the pen tool, but no rAF
  // throttling is needed here — a shape's live preview is 4-6 numbers, not
  // hundreds of accumulated points, cheap enough to update on every
  // pointermove directly.
  const shapeDraftRef = useRef(null); // { type, x1, y1, x2, y2 } | null
  const [shapeDraftPreview, setShapeDraftPreview] = useState(null);

  // Select tool: which strokes/shapes are selected is local, ephemeral UI
  // state, not persisted (same reasoning as `tool`/`view` — an authoring
  // detail, not document content). An id may resolve to either
  // `props.strokes` or `props.shapes` — see `findSelectable` above.
  // `moveDraftRef` mirrors every other gesture's own "authoritative ref,
  // state only for the visual preview" split — `dx`/`dy` are mutated
  // directly on every pointermove so `commitMove` always reads the
  // up-to-date total offset synchronously, without waiting on React state
  // to flush.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const moveDraftRef = useRef(null); // { ids: string[], startX, startY, dx, dy } | null
  const [moveOverride, setMoveOverride] = useState(null); // { ids: string[], dx, dy } | null

  // Marquee (rubber-band) drag: starting a click-drag on empty space
  // selects every stroke/shape whose bounding box intersects the dragged
  // rectangle, replacing the previous selection — an empty-result marquee
  // (e.g. a near-zero-drag click) clears the selection, which is how
  // "click empty space to deselect" falls out of this as a special case
  // rather than a separate code path.
  const marqueeDraftRef = useRef(null); // { startX, startY, x, y } | null (local space)
  const [marqueeRect, setMarqueeRect] = useState(null); // {x,y,width,height} | null, local space

  // Copy/paste/duplicate (Ctrl/Cmd+C / Ctrl/Cmd+V / Ctrl/Cmd+D): an
  // in-memory clipboard, not the OS clipboard — this editor has no other
  // block that round-trips through the system clipboard for its own
  // internal structured data either (see useClipboardHandlers.js's own
  // text/HTML-only scope), and an internal ref avoids needing
  // `navigator.clipboard` permissions for what's purely an in-block
  // operation. Holds the ORIGINAL (unshifted) items so every repeated paste
  // offsets from the same source, not cumulatively from the last paste.
  const clipboardRef = useRef([]); // Array<{ kind: 'stroke'|'shape', item }>

  // Text tool: unlike every other shape, a text box needs a live text-input
  // surface, not just a drag gesture — this local draft holds whatever's
  // currently being typed (a NEW box, or re-editing an EXISTING committed
  // one), rendered as its own <foreignObject><textarea> overlay (see the
  // JSX below), completely separate from the plain, non-editable
  // `<foreignObject><div>` `ShapeElement` renders for every already-
  // committed text shape. Nothing is written to the store until the
  // textarea blurs/commits — same "local draft, one commit" discipline as
  // every other tool here.
  const [textEditDraft, setTextEditDraft] = useState(null); // { id: string|null, x, y, width, height, text, color, fontSize } | null — id is null for a brand-new (not-yet-committed) box

  // Resize (rectangle/ellipse corner drag) + endpoint-drag (arrow) — same
  // ref-is-authoritative/state-is-preview split as move. `resizeDraftRef`'s
  // `mode` is `'rect-corner'` (`fixedX`/`fixedY` pin the OPPOSITE corner,
  // `x`/`y` track the pointer) or `'arrow-endpoint'` (`endpoint` says which
  // of the two points is being dragged).
  const resizeDraftRef = useRef(null);
  const [resizePreviewShape, setResizePreviewShape] = useState(null);

  // Pan/zoom (Phase 5): local view-only state, see the doc comment above —
  // never touches block.props or the store.
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const viewSize = VIEW_SIZE / view.zoom;
  const panRef = useRef(null); // { startClientX, startClientY, startViewX, startViewY } | null
  // Two-finger touch pan: every currently-down TOUCH pointer, keyed by its
  // own pointerId -> last known client position — tracked so a second
  // finger landing mid-gesture can compute the two-touch centroid right
  // away, and so a still-down finger's position stays current while the
  // OTHER finger is the one moving. `touchPanRef` (set once 2+ fingers are
  // down) mirrors `panRef` above almost exactly — same view-delta math,
  // just anchored to the two-touch centroid instead of one mouse position
  // — so a two-finger drag pans the exact same `view` state the middle-
  // mouse-drag pan and Ctrl/Cmd+wheel zoom already share. Pinch-zoom itself
  // stays entirely on the existing `handleWheel` path (trackpad AND
  // touchscreen pinch both reach it as a synthesized ctrl+wheel event) —
  // this only adds the PAN gesture that path has no way to express.
  const touchPointsRef = useRef(new Map()); // pointerId -> { x, y } (client coords)
  const touchPanRef = useRef(null); // { startCenterX, startCenterY, startViewX, startViewY } | null

  // Resize (Phase 4): existing strokes never need rescaling here — they're
  // authored in the fixed 0..1000 normalized space (see VIEW_SIZE above),
  // completely decoupled from the SVG's own rendered pixel size, so
  // dragging the handle is purely "change how big this is drawn."
  const { dragValue: dragSize, startDrag: startResize } = useDragResize({
    compute: (event, start) => ({
      width: Math.max(MIN_CANVAS_WIDTH, Math.round(start.startWidth + (event.clientX - start.startX))),
      height: Math.max(MIN_CANVAS_HEIGHT, Math.round(start.startHeight + (event.clientY - start.startY))),
    }),
    onCommit: (size) => store.applyOperation(updateBlockProps(id, size)),
  });

  const schedulePreviewUpdate = useCallback((size) => {
    if (rafRef.current != null) return; // already scheduled for this frame — pointermove just adds more points to the same buffer
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setPreviewPath(getStrokeOutlinePath(pointsRef.current, { size }));
    });
  }, []);

  const stopDrawing = useCallback(() => {
    drawingRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pointsRef.current = [];
    setPreviewPath(null);
  }, []);

  const commitStroke = useCallback(() => {
    const points = pointsRef.current;
    if (points.length === 0) return;
    // A tap-without-drag still commits a single-point stroke — getStrokeOutlinePath
    // itself renders a single point as a small filled "dot", so no special-casing
    // is needed here beyond just storing whatever points were captured.
    const newStroke = { id: genId(), points, color, size: strokeSize };
    const currentStrokes = block?.props?.strokes ?? [];
    store.applyOperation(updateBlockProps(id, { strokes: [...currentStrokes, newStroke] }));
  }, [store, id, block, color, strokeSize]);

  const scheduleErasingPreview = useCallback(() => {
    if (eraseRafRef.current != null) return;
    eraseRafRef.current = requestAnimationFrame(() => {
      eraseRafRef.current = null;
      setErasingIds(new Set(erasedStrokeIdsRef.current));
      setErasingShapeIds(new Set(erasedShapeIdsRef.current));
    });
  }, []);

  /**
   * Erases whatever the eraser (radius set by `eraserMode` — see
   * ERASER_RADIUS/ERASER_RADIUS_PRECISE's doc comment) touches. Shapes are
   * always whole-object (a plain bounding-box-vs-eraser-circle test for
   * every type — the same "click anywhere in the box" simplification
   * rectangle/ellipse click-select already uses). Strokes differ by mode:
   * Object Eraser marks the WHOLE stroke touched (via the precise
   * per-segment `strokeNearPoint` check, after a cheap bounding-box
   * pre-filter) for a later whole-stroke removal in `commitErase`; Precise
   * Eraser instead marks just the individual POINT INDICES that fall
   * within its (smaller) radius, for a later partial split.
   */
  const hitTestEraserAt = useCallback(
    (x, y) => {
      const radius = eraserMode === 'precise' ? ERASER_RADIUS_PRECISE : ERASER_RADIUS;
      const eraserBox = pointBox(x, y, radius);
      const strokes = block?.props?.strokes ?? [];
      for (const stroke of strokes) {
        if (eraserMode === 'precise') {
          const box = strokeBoundingBox(stroke.points);
          if (!boxesIntersect(box, eraserBox, stroke.size / 2)) continue; // cheap reject before the per-point walk
          let indices = erasedPointIndicesRef.current.get(stroke.id);
          stroke.points.forEach(([px, py], i) => {
            if (indices?.has(i)) return;
            if (Math.hypot(px - x, py - y) > radius) return;
            if (!indices) {
              indices = new Set();
              erasedPointIndicesRef.current.set(stroke.id, indices);
            }
            indices.add(i);
          });
          if (indices?.size) erasedStrokeIdsRef.current.add(stroke.id); // preview-only flag, not a whole-stroke delete in this mode
          continue;
        }
        if (erasedStrokeIdsRef.current.has(stroke.id)) continue;
        const padding = stroke.size / 2;
        const box = strokeBoundingBox(stroke.points);
        if (!boxesIntersect(box, eraserBox, padding)) continue; // cheap reject before the precise per-segment check
        if (strokeNearPoint(stroke, x, y, radius + padding)) erasedStrokeIdsRef.current.add(stroke.id);
      }
      const shapes = block?.props?.shapes ?? [];
      for (const shape of shapes) {
        if (erasedShapeIdsRef.current.has(shape.id)) continue;
        const box = shapeBoundingBox(shape);
        const shapeBox = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
        if (boxesIntersect(shapeBox, eraserBox)) erasedShapeIdsRef.current.add(shape.id);
      }
      scheduleErasingPreview();
    },
    [block, eraserMode, scheduleErasingPreview],
  );

  const stopErasing = useCallback(() => {
    erasingRef.current = false;
    if (eraseRafRef.current != null) {
      cancelAnimationFrame(eraseRafRef.current);
      eraseRafRef.current = null;
    }
    erasedStrokeIdsRef.current = new Set();
    erasedShapeIdsRef.current = new Set();
    erasedPointIndicesRef.current = new Map();
    setErasingIds(new Set());
    setErasingShapeIds(new Set());
  }, []);

  const commitErase = useCallback(() => {
    const hasWholeStrokeErase = eraserMode !== 'precise' && erasedStrokeIdsRef.current.size > 0;
    const hasPartialErase = eraserMode === 'precise' && erasedPointIndicesRef.current.size > 0;
    if (!hasWholeStrokeErase && !hasPartialErase && erasedShapeIdsRef.current.size === 0) return;
    const currentStrokes = block?.props?.strokes ?? [];
    const currentShapes = block?.props?.shapes ?? [];
    let nextStrokes;
    if (hasWholeStrokeErase) {
      nextStrokes = currentStrokes.filter((stroke) => !erasedStrokeIdsRef.current.has(stroke.id));
    } else if (hasPartialErase) {
      nextStrokes = [];
      for (const stroke of currentStrokes) {
        const erasedIndices = erasedPointIndicesRef.current.get(stroke.id);
        if (!erasedIndices || erasedIndices.size === 0) {
          nextStrokes.push(stroke);
          continue;
        }
        splitStrokePoints(stroke.points, erasedIndices).forEach((points, i) => {
          nextStrokes.push({ ...stroke, id: i === 0 ? stroke.id : genId(), points });
        });
      }
    } else {
      nextStrokes = currentStrokes;
    }
    // Touching both arrays together (an erase drag can sweep up strokes
    // and shapes alike) is still exactly one undo step.
    store.applyOperation(
      updateBlockProps(id, {
        strokes: nextStrokes,
        shapes: currentShapes.filter((shape) => !erasedShapeIdsRef.current.has(shape.id)),
      }),
    );
  }, [store, id, block, eraserMode]);

  const stopShapeDraft = useCallback(() => {
    shapeDraftRef.current = null;
    setShapeDraftPreview(null);
  }, []);

  const commitShapeDraft = useCallback(() => {
    const draft = shapeDraftRef.current;
    if (!draft) return;
    // A click-without-drag draws nothing (a zero-size rectangle/ellipse or a
    // zero-length arrow is a pointless, invisible shape) — same "no-op is
    // fine" choice the resize handle makes for a non-drag click, distinct
    // from the pen tool's own tap-still-draws-a-dot behavior, since a dot
    // is a real intentional mark and a degenerate shape is not.
    if (draft.type === 'arrow') {
      if (draft.x1 === draft.x2 && draft.y1 === draft.y2) return;
    } else {
      const rect = normalizeRect(draft.x1, draft.y1, draft.x2, draft.y2);
      if (rect.width === 0 || rect.height === 0) return;
    }
    const newShape = { id: genId(), ...buildDraftShape(draft, color, strokeSize, fill) };
    const currentShapes = block?.props?.shapes ?? [];
    store.applyOperation(updateBlockProps(id, { shapes: [...currentShapes, newShape] }));
  }, [store, id, block, color, strokeSize, fill]);

  const stopMove = useCallback(() => {
    moveDraftRef.current = null;
    setMoveOverride(null);
  }, []);

  const commitMove = useCallback(() => {
    const draft = moveDraftRef.current;
    if (!draft) return;
    if (draft.dx === 0 && draft.dy === 0) return; // a click-without-drag on an already-selected item is just a (re-)selection, nothing to commit
    const idSet = new Set(draft.ids);
    const currentStrokes = block?.props?.strokes ?? [];
    const currentShapes = block?.props?.shapes ?? [];
    const nextStrokes = currentStrokes.map((stroke) =>
      idSet.has(stroke.id) ? applyStrokeOffset(stroke, draft.dx, draft.dy) : stroke,
    );
    const nextShapes = currentShapes.map((shape) =>
      idSet.has(shape.id) ? applyShapeOffset(shape, draft.dx, draft.dy) : shape,
    );
    // Touching both arrays together (a selection can span strokes and
    // shapes) is still exactly one undo step — updateBlockProps already
    // shallow-merges multiple prop keys from a single op.
    store.applyOperation(updateBlockProps(id, { strokes: nextStrokes, shapes: nextShapes }));
  }, [store, id, block]);

  const stopMarquee = useCallback(() => {
    marqueeDraftRef.current = null;
    setMarqueeRect(null);
  }, []);

  const commitMarquee = useCallback(() => {
    const draft = marqueeDraftRef.current;
    if (!draft) return;
    const rect = normalizeRect(draft.startX, draft.startY, draft.x, draft.y);
    // A near-zero drag is a plain click, not a rubber-band selection — treat
    // it as "clicked empty space" (clear the selection) rather than running
    // a bounding-box intersection test, which would wrongly catch whatever
    // bounding box the click point happens to fall inside even when the
    // precise click-select hit-test (hitTestSelectableAt) already said no
    // (e.g. inside a diamond's bounding box corner but outside the diamond
    // itself).
    if (rect.width < MARQUEE_MIN_DRAG && rect.height < MARQUEE_MIN_DRAG) {
      setSelectedIds(new Set());
      return;
    }
    const marqueeBox = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    const strokes = block?.props?.strokes ?? [];
    const shapes = block?.props?.shapes ?? [];
    const hitIds = [];
    for (const stroke of strokes) {
      if (boxesIntersect(strokeBoundingBox(stroke.points), marqueeBox)) hitIds.push(stroke.id);
    }
    for (const shape of shapes) {
      const box = shapeBoundingBox(shape);
      const shapeBox = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
      if (boxesIntersect(shapeBox, marqueeBox)) hitIds.push(shape.id);
    }
    setSelectedIds(new Set(hitIds)); // replaces the previous selection; an empty result clears it
  }, [block]);

  const copySelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    clipboardRef.current = [...selectedIds].map((selId) => findSelectable(block, selId)).filter(Boolean);
  }, [block, selectedIds]);

  /**
   * Inserts one fresh (regenerated-id, offset-by-PASTE_OFFSET) copy of
   * every clipboard entry, in one `updateBlockProps` call spanning both
   * arrays — a paste of a mixed stroke+shape selection is still one undo
   * step, same discipline as group move/delete. The new copies become the
   * selection, so an immediate drag can reposition them, and the tool
   * switches to `select` so that drag is available regardless of whichever
   * tool was active when paste/duplicate was pressed.
   */
  const pasteClipboard = useCallback(() => {
    const items = clipboardRef.current;
    if (items.length === 0) return;
    const currentStrokes = block?.props?.strokes ?? [];
    const currentShapes = block?.props?.shapes ?? [];
    const newStrokes = [];
    const newShapes = [];
    const newIds = [];
    for (const { kind, item } of items) {
      const newId = genId();
      newIds.push(newId);
      if (kind === 'stroke') {
        newStrokes.push({ ...applyStrokeOffset(item, PASTE_OFFSET, PASTE_OFFSET), id: newId });
      } else {
        newShapes.push({ ...applyShapeOffset(item, PASTE_OFFSET, PASTE_OFFSET), id: newId });
      }
    }
    store.applyOperation(
      updateBlockProps(id, { strokes: [...currentStrokes, ...newStrokes], shapes: [...currentShapes, ...newShapes] }),
    );
    setSelectedIds(new Set(newIds));
    setTool('select');
  }, [store, id, block]);

  /**
   * Z-order (front/back): strokes and shapes are two separate arrays, and
   * shapes always render after (visually on top of) every stroke — see the
   * JSX below — so z-order only has meaning WITHIN one kind's own array;
   * there's no single interleaved order across both to reorder into. Moving
   * every selected item of a kind to that array's own front/back keeps the
   * relative order among the moved items themselves, and among the
   * untouched ones, unchanged — the standard "bring to front"/"send to
   * back" behavior for a multi-item selection.
   */
  const reorderSelection = useCallback(
    (toFront) => {
      if (selectedIds.size === 0) return;
      const reorderArray = (items) => {
        const selected = items.filter((item) => selectedIds.has(item.id));
        if (selected.length === 0) return items;
        const rest = items.filter((item) => !selectedIds.has(item.id));
        return toFront ? [...rest, ...selected] : [...selected, ...rest];
      };
      const currentStrokes = block?.props?.strokes ?? [];
      const currentShapes = block?.props?.shapes ?? [];
      store.applyOperation(
        updateBlockProps(id, { strokes: reorderArray(currentStrokes), shapes: reorderArray(currentShapes) }),
      );
    },
    [store, id, block, selectedIds],
  );

  const handleBringToFront = useCallback(() => reorderSelection(true), [reorderSelection]);
  const handleSendToBack = useCallback(() => reorderSelection(false), [reorderSelection]);

  /** Opens the text-edit overlay for a brand-new box at `(x, y)`. */
  const startNewTextEdit = useCallback(
    (x, y) => {
      setTextEditDraft({
        id: null,
        x,
        y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        text: '',
        color,
        fontSize: textFontSize,
      });
    },
    [color, textFontSize],
  );

  /** Re-opens the text-edit overlay for an already-committed text shape, preserving its box/color/font. */
  const startExistingTextEdit = useCallback((shape) => {
    setTextEditDraft({
      id: shape.id,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      text: shape.text,
      color: shape.color,
      fontSize: shape.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    });
  }, []);

  const cancelTextEdit = useCallback(() => {
    setTextEditDraft(null);
  }, []);

  /**
   * Commits the current text draft: empty text is treated as "nothing to
   * keep" — a brand-new box is simply discarded (same "a click-without-
   * content draws nothing" convention every other shape tool uses for a
   * degenerate result), and an existing box that's been fully cleared is
   * DELETED rather than left behind as an empty husk. Non-empty text
   * upserts one shape (new id for a new box, same id + unchanged box/color
   * for an edit) in one `updateBlockProps` call, selects it, and returns to
   * the select tool — same "the result becomes the selection, tool reverts
   * to select" convention paste/duplicate already use.
   */
  const commitTextEdit = useCallback(() => {
    const draft = textEditDraft;
    if (!draft) return;
    setTextEditDraft(null);
    const currentShapes = block?.props?.shapes ?? [];
    const text = draft.text;
    if (!text.trim()) {
      if (draft.id) {
        store.applyOperation(updateBlockProps(id, { shapes: currentShapes.filter((shape) => shape.id !== draft.id) }));
        setSelectedIds(new Set());
      }
      // Restores real DOM focus to the <svg> now that the textarea (which
      // held it) is about to unmount — without this, Delete/nudge/Enter-
      // to-re-edit/... would all silently do nothing right after finishing
      // a text edit, since none of those keydown handlers fire unless the
      // svg itself has focus.
      svgRef.current?.focus();
      return;
    }
    const shapeId = draft.id ?? genId();
    const nextShape = {
      id: shapeId,
      type: 'text',
      x: draft.x,
      y: draft.y,
      width: draft.width,
      height: draft.height,
      text,
      color: draft.color,
      fontSize: draft.fontSize,
    };
    const nextShapes = draft.id
      ? currentShapes.map((shape) => (shape.id === draft.id ? nextShape : shape))
      : [...currentShapes, nextShape];
    store.applyOperation(updateBlockProps(id, { shapes: nextShapes }));
    setSelectedIds(new Set([shapeId]));
    // handlePointerDown's own "clicked away while still in the text tool"
    // guard sets `tool` straight back to 'text' right after triggering
    // this (via blur) when it wants to keep placing more boxes — since
    // both updates land in the same batch, that later call simply wins.
    setTool('select');
    svgRef.current?.focus(); // see the doc comment on the early-return branch above
  }, [store, id, block, textEditDraft]);

  const stopResize = useCallback(() => {
    resizeDraftRef.current = null;
    setResizePreviewShape(null);
  }, []);

  const commitResize = useCallback(() => {
    const draft = resizeDraftRef.current;
    if (!draft) return;
    const currentShapes = block?.props?.shapes ?? [];
    const original = currentShapes.find((shape) => shape.id === draft.shapeId);
    if (!original) return;
    const resized = buildResizedShape(original, draft);
    // Dragging a rectangle/ellipse corner onto (or past) its opposite
    // corner would otherwise commit a degenerate zero-size shape — skip,
    // same "no-op is fine" choice a zero-drag draw already makes.
    if (resized.type !== 'arrow' && (resized.width === 0 || resized.height === 0)) return;
    const nextShapes = currentShapes.map((shape) => (shape.id === draft.shapeId ? resized : shape));
    store.applyOperation(updateBlockProps(id, { shapes: nextShapes }));
  }, [store, id, block]);

  /**
   * Discards whichever single-pointer gesture (draw/erase/shape-draft/move/
   * marquee/resize) the given (first) touch pointer had already started,
   * without committing it — called the instant a SECOND finger touches
   * down mid-gesture, so touch transitions straight into a two-finger pan
   * instead of also leaving behind a stray in-progress stroke/drag from
   * the first finger alone.
   */
  const cancelActiveSingleGesture = useCallback(
    (pointerId) => {
      const svg = svgRef.current;
      if (svg?.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
      if (shapeDraftRef.current) {
        stopShapeDraft();
        return;
      }
      if (moveDraftRef.current) {
        stopMove();
        return;
      }
      if (marqueeDraftRef.current) {
        stopMarquee();
        return;
      }
      if (resizeDraftRef.current) {
        stopResize();
        return;
      }
      if (drawingRef.current) {
        stopDrawing();
        return;
      }
      if (erasingRef.current) {
        stopErasing();
      }
    },
    [stopShapeDraft, stopMove, stopMarquee, stopResize, stopDrawing, stopErasing],
  );

  // Delete/Backspace removes the selection; arrow keys nudge it by
  // NUDGE_STEP (Shift+arrow by NUDGE_STEP_LARGE); Enter re-opens the
  // text-edit overlay for a selected text shape; Ctrl/Cmd+C/V copy/paste
  // the selection through an in-block clipboard (see clipboardRef above);
  // Ctrl/Cmd+D duplicates it directly (copy + paste in one keystroke, no
  // separate clipboard step); Ctrl/Cmd+Shift+]/[ bring the selection to
  // front/send it to back. Verified against
  // src/react/useEditorKeyboardShortcuts.js: its global native keydown
  // handler only acts on Backspace/Delete when a whole BLOCK is selected
  // (getSelectedBlockId(), which this canvas never sets) or a real
  // cross-block *text* selection resolves (resolveCrossBlockSelection,
  // which an SVG has none of), and never inspects 'c'/'v'/'d'/']'/'[' at
  // all — with neither true, that handler does nothing, so this plain
  // keydown scoped to the <svg> itself is safe without any
  // stopPropagation/interference concerns. The <svg> needs real DOM focus
  // for this to fire at all — see handlePointerDown's select-tool branch,
  // which calls `.focus()` the moment an item becomes selected.
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (selectedIds.size === 0) return;
        event.preventDefault();
        const currentStrokes = block?.props?.strokes ?? [];
        const currentShapes = block?.props?.shapes ?? [];
        // A selection can span both kinds — removing both arrays' matches in
        // one op keeps the whole delete a single undo step.
        store.applyOperation(
          updateBlockProps(id, {
            strokes: currentStrokes.filter((stroke) => !selectedIds.has(stroke.id)),
            shapes: currentShapes.filter((shape) => !selectedIds.has(shape.id)),
          }),
        );
        setSelectedIds(new Set());
        return;
      }
      if (NUDGE_DELTAS[event.key] && !event.ctrlKey && !event.metaKey) {
        if (selectedIds.size === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        const [dirX, dirY] = NUDGE_DELTAS[event.key];
        const dx = dirX * step;
        const dy = dirY * step;
        const currentStrokes = block?.props?.strokes ?? [];
        const currentShapes = block?.props?.shapes ?? [];
        store.applyOperation(
          updateBlockProps(id, {
            strokes: currentStrokes.map((stroke) => (selectedIds.has(stroke.id) ? applyStrokeOffset(stroke, dx, dy) : stroke)),
            shapes: currentShapes.map((shape) => (selectedIds.has(shape.id) ? applyShapeOffset(shape, dx, dy) : shape)),
          }),
        );
        return;
      }
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        // Re-opens the text-edit overlay for a selected text shape — the
        // "select it, press Enter to edit" convention (same one Figma
        // uses), since there's no double-click detection in this pass.
        if (selectedIds.size !== 1) return;
        const [selId] = selectedIds;
        const shape = (block?.props?.shapes ?? []).find((s) => s.id === selId && s.type === 'text');
        if (!shape) return;
        event.preventDefault();
        startExistingTextEdit(shape);
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        if (selectedIds.size === 0) return;
        event.preventDefault();
        copySelection();
      } else if (key === 'v') {
        if (clipboardRef.current.length === 0) return;
        event.preventDefault();
        pasteClipboard();
      } else if (key === 'd') {
        if (selectedIds.size === 0) return;
        event.preventDefault();
        copySelection();
        pasteClipboard();
      } else if (event.shiftKey && (key === ']' || key === '[')) {
        // Ctrl/Cmd+Shift+]/[ — the common "bring to front"/"send to back"
        // shortcut convention (Figma, Illustrator, ...); also reachable via
        // the toolbar's own buttons.
        if (selectedIds.size === 0) return;
        event.preventDefault();
        reorderSelection(key === ']');
      }
    },
    [store, id, block, selectedIds, copySelection, pasteClipboard, reorderSelection, startExistingTextEdit],
  );

  const currentView = { x: view.x, y: view.y, size: viewSize };

  const handleWheel = useCallback(
    (event) => {
      const svg = svgRef.current;
      if (!svg) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd+wheel — also how a trackpad OR touchscreen pinch gesture
        // reports itself — zooms the canvas.
        setView((prev) => {
          const zoomFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
          const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * zoomFactor));
          const nextSize = VIEW_SIZE / nextZoom;
          // keep the point under the cursor fixed on screen as the zoom changes
          const { x, y } = zoomAnchoredView(event, svg, { x: prev.x, y: prev.y, size: VIEW_SIZE / prev.zoom }, nextSize);
          return { x, y, zoom: nextZoom };
        });
        return;
      }
      // A plain wheel (no ctrl/meta) is most commonly a trackpad's
      // two-finger scroll gesture (deltaX/deltaY) — pan the canvas view
      // with it instead of letting it scroll the surrounding page, the
      // same "this block owns wheel input" choice the zoom branch above
      // already makes.
      const scale = localPixelScale(svg, viewSize);
      setView((prev) => ({ ...prev, x: prev.x + event.deltaX / scale, y: prev.y + event.deltaY / scale }));
    },
    [viewSize],
  );

  // React registers `wheel` (like `touchstart`/`touchmove`) as a PASSIVE
  // listener at the root by default, a deliberate perf decision so
  // scrolling is never blocked by JS — `event.preventDefault()` inside a
  // passive listener is silently a no-op. That meant Ctrl/Cmd+wheel here
  // was zooming the canvas but ALSO zooming the whole browser page, since
  // the JSX `onWheel` prop's preventDefault never actually took effect. A
  // real native listener (added imperatively, same pattern as
  // EditableBlockContent.jsx's own `beforeinput` listener, for the same
  // "React's synthetic system doesn't give the needed control" reason)
  // isn't forced passive by the browser for `wheel` — only `touchstart`/
  // `touchmove` get that browser-level default — so this fixes it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleZoomIn = useCallback(() => {
    setView((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, prev.zoom * ZOOM_STEP);
      const nextSize = VIEW_SIZE / nextZoom;
      const { x, y } = zoomCenteredView({ x: prev.x, y: prev.y, size: VIEW_SIZE / prev.zoom }, nextSize);
      return { x, y, zoom: nextZoom };
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setView((prev) => {
      const nextZoom = Math.max(MIN_ZOOM, prev.zoom / ZOOM_STEP);
      const nextSize = VIEW_SIZE / nextZoom;
      const { x, y } = zoomCenteredView({ x: prev.x, y: prev.y, size: VIEW_SIZE / prev.zoom }, nextSize);
      return { x, y, zoom: nextZoom };
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setView({ x: 0, y: 0, zoom: 1 });
  }, []);

  /**
   * Exports the current drawing as a downloaded PNG file — rasterizes
   * `buildCanvasSVGMarkup`'s own output (the exact same markup `toHTML`
   * embeds into exported document HTML, see exportSvg.js) by loading it
   * into an `Image` and drawing that onto an offscreen `<canvas>`, at the
   * block's own `width`/`height` (not the fixed 1000x1000 logical space —
   * that's just the SVG's `viewBox`, scaled to fit `width`/`height` exactly
   * like the live component already renders it).
   *
   * Deliberately avoids `Blob`/`URL.createObjectURL` for the SVG-to-Image
   * step — a plain `data:image/svg+xml,...` URI (built with
   * `encodeURIComponent`, which is UTF-8 safe, unlike `btoa` which throws
   * on any non-Latin1 character a typed text box could easily contain) has
   * fewer moving parts and is supported essentially everywhere, including
   * environments where `URL.createObjectURL` might not be. Likewise uses
   * `canvas.toDataURL` (synchronous, universally supported) rather than
   * the async `canvas.toBlob`, and appends the download `<a>` to the
   * document before calling `.click()` — some browsers (notably Firefox)
   * don't reliably trigger a `download`-attribute save from a detached,
   * never-inserted anchor.
   *
   * This whole pipeline is genuinely browser-only: jsdom (the test
   * environment) has no real `<canvas>` 2D context, so `ctx` below comes
   * back null there, and no real `Image` decoding, so `onload` never
   * fires — both make a test that clicks this button a safe no-op rather
   * than a crash, at the cost of the actual rasterization itself not being
   * exercised by the test suite (the pure `buildCanvasSVGMarkup`
   * markup-building logic is what's unit-tested instead).
   */
  const handleExportPNG = useCallback(() => {
    if (!block) return;
    const svgMarkup = buildCanvasSVGMarkup(block);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    const img = new Image();
    img.onload = () => {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = block.props.width;
      exportCanvas.height = block.props.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);
      const link = document.createElement('a');
      link.href = exportCanvas.toDataURL('image/png');
      link.download = 'canvas.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.src = svgDataUrl;
  }, [block]);

  /**
   * Double-clicking a text shape re-opens its edit overlay — the standard,
   * discoverable way most editors expect (Enter-on-a-selected-text-shape,
   * wired in handleKeyDown, still works too, as a keyboard-only
   * alternative). Uses the native `dblclick` event rather than manually
   * tracking click timing/position — the browser already does that
   * correctly, including canceling itself on drags, and there's no
   * meaningful risk of firing this by accident during any of this
   * component's own drag gestures, all of which are driven by
   * pointerdown/pointermove/pointerup rather than click/dblclick.
   */
  const handleDoubleClick = useCallback(
    (event) => {
      if (tool !== 'select') return;
      const svg = svgRef.current;
      if (!svg) return;
      const [x, y] = clientToLocal(event, svg, { x: view.x, y: view.y, size: viewSize });
      const shapes = block?.props?.shapes ?? [];
      const hitId = hitTestShapeAt(x, y, shapes);
      const shape = shapes.find((s) => s.id === hitId);
      if (shape?.type !== 'text') return;
      setSelectedIds(new Set([shape.id]));
      startExistingTextEdit(shape);
    },
    [tool, view.x, view.y, viewSize, block, startExistingTextEdit],
  );

  const handlePointerDown = useCallback(
    (event) => {
      const svg = svgRef.current;
      if (!svg) return;

      if (event.pointerType === 'touch') {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPointsRef.current.size >= 2) {
          // A second finger landing mid-gesture: switch straight into a
          // two-finger pan, discarding whatever the first finger alone had
          // already started (see cancelActiveSingleGesture).
          event.preventDefault();
          svg.setPointerCapture?.(event.pointerId);
          if (!touchPanRef.current) {
            for (const pointerId of touchPointsRef.current.keys()) {
              if (pointerId !== event.pointerId) cancelActiveSingleGesture(pointerId);
            }
            const center = touchCentroid(touchPointsRef.current);
            touchPanRef.current = { startCenterX: center.x, startCenterY: center.y, startViewX: view.x, startViewY: view.y };
          }
          return;
        }
      }

      if (textEditDraft) {
        // A pointerdown landing on the textarea ITSELF (repositioning the
        // cursor, selecting text while typing) is normal editing
        // interaction, not "clicked away" — let the browser handle it,
        // skip all tool logic below entirely.
        if (event.target?.closest?.('.be-canvas-text-editor')) return;
        // Anything else landing on this <svg> means the user clicked away
        // from an in-progress text edit. This can't be left to the
        // textarea's own onBlur to happen naturally on its own timing:
        // `pointerdown` (and this handler) fires BEFORE the browser's
        // mousedown-triggered blur/focus-change default action, so without
        // forcing the blur here FIRST, whatever this pointerdown is about
        // to do below (start a new text box, select a shape, start
        // drawing, ...) would run first and the in-progress edit's typed
        // text would be silently discarded instead of committed — the bug
        // this guard exists to prevent. Blurring synchronously (rather
        // than calling commitTextEdit directly here too) routes through
        // the textarea's own onBlur so there's exactly one commit path,
        // not two that could double-fire and create a duplicate shape.
        document.activeElement?.blur?.();
        if (tool === 'text') {
          // Immediately place the next box at this same click rather than
          // falling through to the branches below, which would otherwise
          // still be dispatching this same pointerdown against the OLD
          // (pre-commit) state. The blur above already committed the
          // previous box and set `tool` to 'select' (see commitTextEdit) —
          // setting it back to 'text' keeps the tool active for placing
          // further boxes in one continuous flow.
          let [textX, textY] = clientToLocal(event, svg, currentView);
          if (snapEnabled) [textX, textY] = [snapValue(textX), snapValue(textY)];
          startNewTextEdit(textX, textY);
          setTool('text');
          return;
        }
      }

      if (event.button === 1) {
        // Middle-mouse-button drag pans, regardless of the currently active
        // tool — a plain, always-available gesture (see the component doc
        // comment for why this was chosen over a space-bar-held convention).
        event.preventDefault();
        svg.setPointerCapture?.(event.pointerId);
        panRef.current = { startClientX: event.clientX, startClientY: event.clientY, startViewX: view.x, startViewY: view.y };
        return;
      }
      if (!event.isPrimary || (event.button !== undefined && event.button !== 0)) return;

      event.preventDefault();
      // Optional chaining: SVG pointer capture isn't universally implemented
      // (notably missing in jsdom, and historically inconsistent in some
      // browsers) — drawing/erasing still works without it, just without the
      // "keeps tracking outside the element bounds" guarantee.
      svg.setPointerCapture?.(event.pointerId);
      const [x, y] = clientToLocal(event, svg, currentView);

      if (tool === 'eraser') {
        erasedStrokeIdsRef.current = new Set();
        erasedShapeIdsRef.current = new Set();
        erasedPointIndicesRef.current = new Map();
        erasingRef.current = true;
        hitTestEraserAt(x, y); // a click-without-drag still erases whatever's right under it
      } else if (SHAPE_TOOLS.has(tool)) {
        const startX = snapEnabled ? snapValue(x) : x;
        const startY = snapEnabled ? snapValue(y) : y;
        shapeDraftRef.current = { type: tool, x1: startX, y1: startY, x2: startX, y2: startY };
        setShapeDraftPreview(buildDraftShape(shapeDraftRef.current, color, strokeSize, fill));
      } else if (tool === 'select') {
        const strokesList = block?.props?.strokes ?? [];
        const shapesList = block?.props?.shapes ?? [];
        // Resize/endpoint handles are single-selection-only, and only for a
        // shape (strokes were never resizable) — see the component doc
        // comment.
        const singleSelectedShape =
          selectedIds.size === 1 ? shapesList.find((shape) => selectedIds.has(shape.id)) ?? null : null;
        const handle = hitTestHandle(x, y, singleSelectedShape);
        if (handle) {
          // Grabbing a handle always takes priority over re-selecting/moving
          // the shape it belongs to.
          if (handle === 'rotate') {
            const { cx, cy } = shapeCenter(singleSelectedShape);
            // The pointer's own angle from the shape's center, at drag
            // start — every subsequent pointermove compares its own angle
            // against this to get a rotation DELTA, added onto the
            // shape's rotation at drag start (not overwritten), so
            // starting a new rotate drag from an already-rotated shape
            // continues from there rather than snapping.
            const startAngle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
            resizeDraftRef.current = {
              mode: 'rotate',
              shapeId: singleSelectedShape.id,
              cx,
              cy,
              startAngle,
              startRotation: singleSelectedShape.rotation ?? 0,
              rotation: singleSelectedShape.rotation ?? 0,
            };
          } else if (singleSelectedShape.type === 'arrow') {
            resizeDraftRef.current = { mode: 'arrow-endpoint', shapeId: singleSelectedShape.id, endpoint: handle, x, y };
          } else {
            const [fixedX, fixedY] = rectCorners(singleSelectedShape)[OPPOSITE_CORNER[handle]];
            resizeDraftRef.current = { mode: 'rect-corner', shapeId: singleSelectedShape.id, fixedX, fixedY, x, y };
          }
          setResizePreviewShape(buildResizedShape(singleSelectedShape, resizeDraftRef.current));
          return;
        }
        const hit = hitTestSelectableAt(x, y, strokesList, shapesList);
        if (hit) {
          if (event.shiftKey) {
            // Shift+click only toggles membership — a deliberate plain
            // click-drag afterward is needed to move the adjusted selection.
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(hit.id)) next.delete(hit.id);
              else next.add(hit.id);
              return next;
            });
            return;
          }
          // Clicking an already-selected item starts a group move of the
          // WHOLE current selection; clicking a not-yet-selected item
          // collapses selection to just that one first — group-move-of-1 is
          // the same code path. Either way this both selects AND
          // immediately starts a move drag in the same gesture, the
          // standard "click-drag to move" convention.
          const nextIds = selectedIds.has(hit.id) ? selectedIds : new Set([hit.id]);
          setSelectedIds(nextIds);
          moveDraftRef.current = { ids: [...nextIds], startX: x, startY: y, dx: 0, dy: 0 };
          svg.focus(); // real DOM focus so handleKeyDown's own Delete/Backspace can fire
        } else {
          // Empty space: start a marquee drag instead of immediately
          // clearing the selection — an empty-result marquee clears it on
          // release (see commitMarquee), preserving that behavior as a
          // special case.
          marqueeDraftRef.current = { startX: x, startY: y, x, y };
        }
      } else if (tool === 'text') {
        // A click-drag isn't needed to size a text box (unlike the other
        // shape tools) — it starts at a fixed default size, resizable
        // afterward like any other shape — so pointerdown alone is enough
        // to open the edit overlay; there's no shapeDraftRef drag to track.
        startNewTextEdit(snapEnabled ? snapValue(x) : x, snapEnabled ? snapValue(y) : y);
      } else if (tool === 'pen') {
        pointsRef.current = [[x, y, event.pressure || 0.5]];
        drawingRef.current = true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tool,
      hitTestEraserAt,
      view.x,
      view.y,
      viewSize,
      color,
      strokeSize,
      fill,
      snapEnabled,
      block,
      selectedIds,
      startNewTextEdit,
      textEditDraft,
      cancelActiveSingleGesture,
    ],
  );

  const handlePointerMove = useCallback(
    (event) => {
      const svg = svgRef.current;
      if (!svg) return;

      if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPanRef.current) {
          event.preventDefault();
          const scale = localPixelScale(svg, viewSize);
          const center = touchCentroid(touchPointsRef.current);
          const { startCenterX, startCenterY, startViewX, startViewY } = touchPanRef.current;
          const dx = (center.x - startCenterX) / scale;
          const dy = (center.y - startCenterY) / scale;
          // startViewX/startViewY are captured above (not read from the ref
          // inside this updater) — several of these events can be queued
          // within the same React batch, and touchPanRef.current may
          // already have been reset to null by a LATER pointerup/pointer-
          // cancel by the time this updater actually runs.
          setView((prev) => ({ ...prev, x: startViewX - dx, y: startViewY - dy }));
          return;
        }
      }

      if (panRef.current) {
        // Same letterbox-aware scale clientToLocal uses (see canvasGeometry.js) —
        // a delta only needs the shared scale factor, not the absolute view.x/y offset.
        const scale = localPixelScale(svg, viewSize);
        const { startClientX, startClientY, startViewX, startViewY } = panRef.current;
        const dx = (event.clientX - startClientX) / scale;
        const dy = (event.clientY - startClientY) / scale;
        // startViewX/startViewY are captured above rather than read from
        // the ref inside this updater — a queued functional setView update
        // runs later, by which point panRef.current could already have
        // been reset to null by a subsequent pointerup/pointercancel
        // dispatched within the same batch (see the identical touch-pan
        // fix above, where this exact lazy-read pattern crashed).
        setView((prev) => ({ ...prev, x: startViewX - dx, y: startViewY - dy }));
        return;
      }
      if (shapeDraftRef.current) {
        let [x, y] = clientToLocal(event, svg, currentView);
        if (snapEnabled) [x, y] = [snapValue(x), snapValue(y)];
        shapeDraftRef.current = { ...shapeDraftRef.current, x2: x, y2: y };
        setShapeDraftPreview(buildDraftShape(shapeDraftRef.current, color, strokeSize, fill));
        return;
      }
      if (moveDraftRef.current) {
        const [x, y] = clientToLocal(event, svg, currentView);
        const draft = moveDraftRef.current;
        // Snaps the DELTA itself (not an absolute position — ambiguous for
        // a multi-item group, each with its own origin) to the grid, so a
        // drag's movement is quantized to grid-sized steps rather than
        // landing any particular item exactly on a grid line.
        draft.dx = snapEnabled ? snapValue(x - draft.startX) : x - draft.startX;
        draft.dy = snapEnabled ? snapValue(y - draft.startY) : y - draft.startY;
        setMoveOverride({ ids: draft.ids, dx: draft.dx, dy: draft.dy });
        return;
      }
      if (marqueeDraftRef.current) {
        const [x, y] = clientToLocal(event, svg, currentView);
        const draft = marqueeDraftRef.current;
        draft.x = x;
        draft.y = y;
        setMarqueeRect(normalizeRect(draft.startX, draft.startY, draft.x, draft.y));
        return;
      }
      if (resizeDraftRef.current) {
        let [x, y] = clientToLocal(event, svg, currentView);
        const draft = resizeDraftRef.current;
        if (draft.mode === 'rotate') {
          const currentAngle = (Math.atan2(y - draft.cy, x - draft.cx) * 180) / Math.PI;
          const rawRotation = draft.startRotation + (currentAngle - draft.startAngle);
          draft.rotation = snapEnabled ? snapAngle(rawRotation) : rawRotation;
        } else {
          // A single point (a resize corner or arrow endpoint) snapping to
          // the grid, unlike a group move's delta, unambiguously means
          // "land exactly on a grid line."
          if (snapEnabled) [x, y] = [snapValue(x), snapValue(y)];
          draft.x = x;
          draft.y = y;
        }
        const shapes = block?.props?.shapes ?? [];
        const original = shapes.find((shape) => shape.id === draft.shapeId);
        if (original) setResizePreviewShape(buildResizedShape(original, draft));
        return;
      }
      if (drawingRef.current) {
        const [x, y] = clientToLocal(event, svg, currentView);
        pointsRef.current.push([x, y, event.pressure || 0.5]);
        schedulePreviewUpdate(strokeSize);
      } else if (erasingRef.current) {
        const [x, y] = clientToLocal(event, svg, currentView);
        hitTestEraserAt(x, y);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedulePreviewUpdate, hitTestEraserAt, view.x, view.y, viewSize, strokeSize, color, fill, snapEnabled, block],
  );

  const releaseCapture = useCallback((event) => {
    const svg = svgRef.current;
    if (svg?.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      if (event.pointerType === 'touch') {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPanRef.current) {
          releaseCapture(event);
          if (touchPointsRef.current.size < 2) touchPanRef.current = null;
          return;
        }
      }
      if (panRef.current) {
        releaseCapture(event);
        panRef.current = null;
        return;
      }
      if (shapeDraftRef.current) {
        releaseCapture(event);
        commitShapeDraft();
        stopShapeDraft();
        return;
      }
      if (moveDraftRef.current) {
        releaseCapture(event);
        commitMove();
        stopMove();
        return;
      }
      if (marqueeDraftRef.current) {
        releaseCapture(event);
        commitMarquee();
        stopMarquee();
        return;
      }
      if (resizeDraftRef.current) {
        releaseCapture(event);
        commitResize();
        stopResize();
        return;
      }
      if (drawingRef.current) {
        releaseCapture(event);
        commitStroke();
        stopDrawing();
      } else if (erasingRef.current) {
        releaseCapture(event);
        commitErase();
        stopErasing();
      }
    },
    [
      releaseCapture,
      commitShapeDraft,
      stopShapeDraft,
      commitMove,
      stopMove,
      commitMarquee,
      stopMarquee,
      commitResize,
      stopResize,
      commitStroke,
      stopDrawing,
      commitErase,
      stopErasing,
    ],
  );

  // A pointercancel (palm rejection, an OS gesture taking over, ...) means
  // the interaction was aborted, not finished — discard rather than commit,
  // unlike pointerup.
  const handlePointerCancel = useCallback(
    (event) => {
      if (event.pointerType === 'touch') {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPanRef.current) {
          releaseCapture(event);
          if (touchPointsRef.current.size < 2) touchPanRef.current = null;
          return;
        }
      }
      if (panRef.current) {
        releaseCapture(event);
        panRef.current = null;
        return;
      }
      if (shapeDraftRef.current) {
        releaseCapture(event);
        stopShapeDraft();
        return;
      }
      if (moveDraftRef.current) {
        releaseCapture(event);
        stopMove();
        return;
      }
      if (marqueeDraftRef.current) {
        releaseCapture(event);
        stopMarquee();
        return;
      }
      if (resizeDraftRef.current) {
        releaseCapture(event);
        stopResize();
        return;
      }
      if (drawingRef.current) {
        releaseCapture(event);
        stopDrawing();
      } else if (erasingRef.current) {
        releaseCapture(event);
        stopErasing();
      }
    },
    [releaseCapture, stopShapeDraft, stopMove, stopMarquee, stopResize, stopDrawing, stopErasing],
  );

  const handleResizeStart = useCallback(
    (event) => {
      startResize(event, {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: block?.props?.width ?? DEFAULT_CANVAS_WIDTH,
        startHeight: block?.props?.height ?? DEFAULT_CANVAS_HEIGHT,
      });
    },
    [startResize, block],
  );

  if (!block) return null;
  const { strokes = [], shapes = [], width, height } = block.props;
  const effectiveWidth = dragSize?.width ?? width;
  const effectiveHeight = dragSize?.height ?? height;

  const SELECTION_PADDING = 6;
  // One dashed box per selected item (strokes and shapes alike), reflecting
  // an in-progress group move's live offset — 2+ selected renders one box
  // each, no union/group bounding box in this pass.
  const selectionBoxes = [...selectedIds]
    .map((selId) => {
      const found = findSelectable(block, selId);
      if (!found) return null;
      let { kind, item } = found;
      if (moveOverride?.ids?.includes(selId)) {
        item =
          kind === 'stroke'
            ? applyStrokeOffset(item, moveOverride.dx, moveOverride.dy)
            : applyShapeOffset(item, moveOverride.dx, moveOverride.dy);
      } else if (kind === 'shape' && resizePreviewShape?.id === selId) {
        item = resizePreviewShape;
      }
      return { id: selId, kind, item, box: selectableBoundingBox(kind, item), rotation: kind === 'shape' ? item.rotation : 0 };
    })
    .filter(Boolean);

  // Resize/endpoint/rotate handles are shown only for exactly 1 selected
  // item, and only when it's a shape (strokes were never resizable) — no
  // group-resize/rotate in this pass.
  const singleSelectedShapeEntry =
    selectionBoxes.length === 1 && selectionBoxes[0].kind === 'shape' ? selectionBoxes[0] : null;
  const selectedDisplayShape = singleSelectedShapeEntry?.item ?? null;
  // Corner resize handles are hidden once the shape has any rotation — see
  // the component doc comment on rotation's scope (no rotated-resize math
  // in this pass); the rotate handle itself is unaffected by that and shown
  // for any non-arrow single selection, rotated or not.
  const selectionHandlePoints =
    selectedDisplayShape && selectedDisplayShape.type === 'arrow'
      ? [
          ['start', selectedDisplayShape.x1, selectedDisplayShape.y1],
          ['end', selectedDisplayShape.x2, selectedDisplayShape.y2],
        ]
      : selectedDisplayShape && !selectedDisplayShape.rotation
        ? Object.entries(rectCorners(selectedDisplayShape)).map(([corner, [cx, cy]]) => [corner, cx, cy])
        : [];
  const rotateHandle =
    selectedDisplayShape && selectedDisplayShape.type !== 'arrow' ? rotateHandlePoint(selectedDisplayShape) : null;

  return (
    <div className={className} data-block-id={id} data-tool={tool} contentEditable={false} tabIndex={-1}>
      <div className="be-canvas-toolbar" contentEditable={false}>
        <button
          type="button"
          className={`be-canvas-toolbar-btn${tool === 'pen' ? ' be-canvas-toolbar-btn-active' : ''}`}
          aria-pressed={tool === 'pen'}
          aria-label="Pen"
          title="Pen"
          onClick={() => setTool('pen')}
        >
          <PencilIcon size={14} />
        </button>
        <div className="be-canvas-picker-wrap">
          <button
            ref={eraserTriggerRef}
            type="button"
            className={`be-canvas-toolbar-btn${tool === 'eraser' ? ' be-canvas-toolbar-btn-active' : ''}`}
            aria-haspopup="true"
            aria-expanded={isEraserPickerOpen}
            aria-pressed={tool === 'eraser'}
            aria-label="Eraser"
            title="Eraser"
            onClick={() => setIsEraserPickerOpen((open) => !open)}
          >
            {(() => {
              const ActiveEraserIcon = ERASER_MODE_LIST.find((e) => e.mode === eraserMode)?.Icon ?? EraserIcon;
              return <ActiveEraserIcon size={14} />;
            })()}
          </button>
          {isEraserPickerOpen && (
            <div ref={eraserPopoverRef} className="be-canvas-picker be-canvas-shape-picker" role="menu" aria-label="Eraser">
              {ERASER_MODE_LIST.map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitem"
                  className={`be-canvas-toolbar-btn${tool === 'eraser' && eraserMode === mode ? ' be-canvas-toolbar-btn-active' : ''}`}
                  aria-pressed={tool === 'eraser' && eraserMode === mode}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    setTool('eraser');
                    setEraserMode(mode);
                    closeEraserPicker();
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`be-canvas-toolbar-btn${tool === 'select' ? ' be-canvas-toolbar-btn-active' : ''}`}
          aria-pressed={tool === 'select'}
          aria-label="Select"
          title="Select"
          onClick={() => setTool('select')}
        >
          <CursorIcon size={14} />
        </button>
        <button
          type="button"
          className={`be-canvas-toolbar-btn${tool === 'text' ? ' be-canvas-toolbar-btn-active' : ''}`}
          aria-pressed={tool === 'text'}
          aria-label="Text"
          title="Text"
          onClick={() => setTool('text')}
        >
          <TextIcon size={14} />
        </button>
        <div className="be-canvas-picker-wrap">
          <button
            ref={fontSizeTriggerRef}
            type="button"
            className="be-canvas-toolbar-btn"
            aria-haspopup="true"
            aria-expanded={isFontSizePickerOpen}
            aria-label={`Font size: ${textEditDraft ? textEditDraft.fontSize : textFontSize}`}
            title="Font size"
            onClick={() => setIsFontSizePickerOpen((open) => !open)}
          >
            <span className="be-canvas-font-size-trigger">A</span>
          </button>
          {isFontSizePickerOpen && (
            <div
              ref={fontSizePopoverRef}
              className="be-canvas-picker be-canvas-size-picker"
              role="dialog"
              aria-label="Font size"
            >
              <span className="be-canvas-size-preview" aria-hidden="true">
                <span
                  className="be-canvas-font-size-preview-letter"
                  style={{ fontSize: textEditDraft ? textEditDraft.fontSize : textFontSize }}
                >
                  A
                </span>
              </span>
              <input
                type="range"
                className="be-canvas-size-slider"
                min={MIN_TEXT_FONT_SIZE}
                max={MAX_TEXT_FONT_SIZE}
                value={textEditDraft ? textEditDraft.fontSize : textFontSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setTextFontSize(value);
                  // Live-updates the box actively being typed into, if any
                  // — see textFontSize's own doc comment above for why.
                  if (textEditDraft) setTextEditDraft((prev) => (prev ? { ...prev, fontSize: value } : prev));
                }}
                aria-label="Font size"
              />
              <span className="be-canvas-size-value">{textEditDraft ? textEditDraft.fontSize : textFontSize}px</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="be-canvas-toolbar-btn"
          aria-label="Bring to front"
          title="Bring to front"
          onClick={handleBringToFront}
          disabled={selectedIds.size === 0}
        >
          <ArrowUpIcon size={14} />
        </button>
        <button
          type="button"
          className="be-canvas-toolbar-btn"
          aria-label="Send to back"
          title="Send to back"
          onClick={handleSendToBack}
          disabled={selectedIds.size === 0}
        >
          <ArrowDownIcon size={14} />
        </button>
        <span className="be-canvas-toolbar-divider" />
        <div className="be-canvas-picker-wrap">
          <button
            ref={shapeTriggerRef}
            type="button"
            className={`be-canvas-toolbar-btn${SHAPE_TOOLS.has(tool) ? ' be-canvas-toolbar-btn-active' : ''}`}
            aria-haspopup="true"
            aria-expanded={isShapePickerOpen}
            aria-label="Shape"
            title="Shape"
            onClick={() => setIsShapePickerOpen((open) => !open)}
          >
            {(() => {
              const ActiveShapeIcon =
                SHAPE_TOOL_LIST.find((s) => s.type === (SHAPE_TOOLS.has(tool) ? tool : lastShapeTool))?.Icon ?? SquareIcon;
              return <ActiveShapeIcon size={14} />;
            })()}
          </button>
          {isShapePickerOpen && (
            <div ref={shapePopoverRef} className="be-canvas-picker be-canvas-shape-picker" role="menu" aria-label="Shape">
              {SHAPE_TOOL_LIST.map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className={`be-canvas-toolbar-btn${tool === type ? ' be-canvas-toolbar-btn-active' : ''}`}
                  aria-pressed={tool === type}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    setTool(type);
                    setLastShapeTool(type);
                    closeShapePicker();
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="be-canvas-toolbar-divider" />
        <div className="be-canvas-picker-wrap">
          <button
            ref={colorTriggerRef}
            type="button"
            className="be-canvas-toolbar-btn"
            aria-haspopup="true"
            aria-expanded={isColorPickerOpen}
            aria-label={`Color: ${color}`}
            title="Color"
            onClick={() => setIsColorPickerOpen((open) => !open)}
          >
            <span className="be-canvas-color-trigger-dot" style={{ backgroundColor: color }} />
          </button>
          {isColorPickerOpen && (
            <div ref={colorPopoverRef} className="be-canvas-picker be-canvas-color-picker" role="menu" aria-label="Pen color">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="menuitem"
                  className={`be-canvas-toolbar-swatch${color === swatch ? ' be-canvas-toolbar-swatch-active' : ''}`}
                  style={{ backgroundColor: swatch }}
                  aria-pressed={color === swatch}
                  aria-label={`Color ${swatch}`}
                  title={`Color ${swatch}`}
                  onClick={() => {
                    setColor(swatch);
                    closeColorPicker();
                  }}
                />
              ))}
              <label className="be-canvas-custom-swatch" title="Custom color" aria-label="Custom color">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              </label>
            </div>
          )}
        </div>
        <span className="be-canvas-toolbar-divider" />
        <div className="be-canvas-picker-wrap">
          <button
            ref={fillTriggerRef}
            type="button"
            className="be-canvas-toolbar-btn"
            aria-haspopup="true"
            aria-expanded={isFillPickerOpen}
            aria-label={`Fill: ${fill ?? 'none'}`}
            title="Fill"
            onClick={() => setIsFillPickerOpen((open) => !open)}
          >
            <span
              className={`be-canvas-fill-trigger-dot${fill ? '' : ' be-canvas-fill-trigger-dot-none'}`}
              style={fill ? { backgroundColor: fill } : undefined}
            />
          </button>
          {isFillPickerOpen && (
            <div ref={fillPopoverRef} className="be-canvas-picker be-canvas-color-picker" role="menu" aria-label="Shape fill">
              <button
                type="button"
                role="menuitem"
                className={`be-canvas-toolbar-swatch be-canvas-fill-swatch-none${fill === null ? ' be-canvas-toolbar-swatch-active' : ''}`}
                aria-pressed={fill === null}
                aria-label="No fill"
                title="No fill"
                onClick={() => {
                  setFill(null);
                  closeFillPicker();
                }}
              />
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="menuitem"
                  className={`be-canvas-toolbar-swatch${fill === swatch ? ' be-canvas-toolbar-swatch-active' : ''}`}
                  style={{ backgroundColor: swatch }}
                  aria-pressed={fill === swatch}
                  aria-label={`Fill ${swatch}`}
                  title={`Fill ${swatch}`}
                  onClick={() => {
                    setFill(swatch);
                    closeFillPicker();
                  }}
                />
              ))}
              <label className="be-canvas-custom-swatch" title="Custom fill" aria-label="Custom fill">
                <input type="color" value={fill ?? DEFAULT_COLOR} onChange={(event) => setFill(event.target.value)} />
              </label>
            </div>
          )}
        </div>
        <span className="be-canvas-toolbar-divider" />
        <div className="be-canvas-picker-wrap">
          <button
            ref={sizeTriggerRef}
            type="button"
            className="be-canvas-toolbar-btn"
            aria-haspopup="true"
            aria-expanded={isSizePickerOpen}
            aria-label={`Stroke size: ${strokeSize}`}
            title="Stroke size"
            onClick={() => setIsSizePickerOpen((open) => !open)}
          >
            <span
              className="be-canvas-size-trigger-dot"
              style={{ width: Math.min(strokeSize, 16), height: Math.min(strokeSize, 16) }}
            />
          </button>
          {isSizePickerOpen && (
            <div ref={sizePopoverRef} className="be-canvas-picker be-canvas-size-picker" role="dialog" aria-label="Stroke size">
              <span className="be-canvas-size-preview" aria-hidden="true">
                <span className="be-canvas-size-preview-dot" style={{ width: strokeSize, height: strokeSize }} />
              </span>
              <input
                type="range"
                className="be-canvas-size-slider"
                min={MIN_STROKE_SIZE}
                max={MAX_STROKE_SIZE}
                value={strokeSize}
                onChange={(event) => setStrokeSize(Number(event.target.value))}
                aria-label="Stroke size"
              />
              <span className="be-canvas-size-value">{strokeSize}px</span>
            </div>
          )}
        </div>
        <span className="be-canvas-toolbar-divider" />
        <button
          type="button"
          className={`be-canvas-toolbar-btn${snapEnabled ? ' be-canvas-toolbar-btn-active' : ''}`}
          aria-pressed={snapEnabled}
          aria-label="Snap to grid"
          title={
            snapEnabled
              ? 'Snap to grid: ON — drawing, moving, resizing and rotating align to the dotted grid. Click to turn off.'
              : 'Snap to grid: OFF — click to turn on (aligns drawing, moving, resizing and rotating to a grid)'
          }
          onClick={() => setSnapEnabled((prev) => !prev)}
        >
          <MagnetIcon size={14} />
        </button>
        <span className="be-canvas-toolbar-divider" />
        <button
          type="button"
          className="be-canvas-toolbar-btn"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={handleZoomOut}
          disabled={view.zoom <= MIN_ZOOM}
        >
          −
        </button>
        <button
          type="button"
          className="be-canvas-zoom-label"
          aria-label={`Zoom: ${Math.round(view.zoom * 100)}%. Click to reset to 100%.`}
          title="Reset zoom to 100%"
          onClick={handleZoomReset}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          className="be-canvas-toolbar-btn"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={handleZoomIn}
          disabled={view.zoom >= MAX_ZOOM}
        >
          +
        </button>
        <span className="be-canvas-toolbar-divider" />
        <button
          type="button"
          className="be-canvas-toolbar-btn"
          aria-label="Export PNG"
          title="Export as PNG"
          onClick={handleExportPNG}
          disabled={strokes.length === 0 && shapes.length === 0}
        >
          <DownloadIcon size={14} />
        </button>
      </div>
      <svg
        ref={svgRef}
        className="be-canvas-surface"
        viewBox={`${view.x} ${view.y} ${viewSize} ${viewSize}`}
        width={effectiveWidth}
        height={effectiveHeight}
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {snapEnabled && (
          <>
            {/* A dot grid at a coarser spacing than SNAP_GRID_SIZE itself
                (10 units) — showing every actual snap line would be a
                10x10=100 solid wall of dots at this space's scale, not a
                helpful visual reference. This exists purely so "snap to
                grid" has something visible to point at (see the toolbar
                button's own title) — drawing/dragging still snaps to the
                finer, unrendered SNAP_GRID_SIZE lines underneath it. */}
            <defs>
              <pattern
                id={`be-canvas-grid-${id}`}
                width={SNAP_GRID_VISUAL_SPACING}
                height={SNAP_GRID_VISUAL_SPACING}
                patternUnits="userSpaceOnUse"
              >
                <circle cx={1} cy={1} r={1.5} className="be-canvas-grid-dot" />
              </pattern>
            </defs>
            <rect
              className="be-canvas-grid-background"
              x={view.x}
              y={view.y}
              width={viewSize}
              height={viewSize}
              fill={`url(#be-canvas-grid-${id})`}
            />
          </>
        )}
        {strokes.map((stroke) => {
          const moved = moveOverride?.ids?.includes(stroke.id);
          const path = moved
            ? getStrokeOutlinePath(applyStrokeOffset(stroke, moveOverride.dx, moveOverride.dy).points, { size: stroke.size })
            : getStrokePath(stroke);
          return (
            <path
              key={stroke.id}
              d={path}
              fill={stroke.color}
              fillRule="nonzero"
              opacity={erasingIds.has(stroke.id) ? 0.25 : 1}
            />
          );
        })}
        {previewPath && <path d={previewPath} fill={color} fillRule="nonzero" />}
        {shapes.map((shape) => {
          let displayShape = shape;
          if (moveOverride?.ids?.includes(shape.id)) displayShape = applyShapeOffset(shape, moveOverride.dx, moveOverride.dy);
          else if (resizePreviewShape?.id === shape.id) displayShape = resizePreviewShape;
          return <ShapeElement key={shape.id} shape={displayShape} opacity={erasingShapeIds.has(shape.id) ? 0.25 : 1} />;
        })}
        {shapeDraftPreview && <ShapeElement shape={shapeDraftPreview} opacity={0.6} />}
        {selectionBoxes.map(({ id: selId, box, rotation }) => (
          <g
            key={selId}
            transform={rotation ? `rotate(${rotation} ${box.x + box.width / 2} ${box.y + box.height / 2})` : undefined}
          >
            <rect
              className="be-canvas-selection-box"
              x={box.x - SELECTION_PADDING}
              y={box.y - SELECTION_PADDING}
              width={box.width + SELECTION_PADDING * 2}
              height={box.height + SELECTION_PADDING * 2}
              fill="none"
            />
          </g>
        ))}
        {selectionHandlePoints.map(([corner, cx, cy]) => (
          <rect
            key={corner}
            className="be-canvas-selection-handle"
            x={cx - HANDLE_VISUAL_SIZE / 2}
            y={cy - HANDLE_VISUAL_SIZE / 2}
            width={HANDLE_VISUAL_SIZE}
            height={HANDLE_VISUAL_SIZE}
          />
        ))}
        {rotateHandle && (
          <circle
            className="be-canvas-rotate-handle"
            cx={rotateHandle[0]}
            cy={rotateHandle[1]}
            r={HANDLE_VISUAL_SIZE / 2}
          />
        )}
        {marqueeRect && (
          <rect
            className="be-canvas-marquee"
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.width}
            height={marqueeRect.height}
          />
        )}
        {textEditDraft && (
          <foreignObject x={textEditDraft.x} y={textEditDraft.y} width={textEditDraft.width} height={textEditDraft.height}>
            <textarea
              // eslint-disable-next-line react/no-unknown-property
              xmlns="http://www.w3.org/1999/xhtml"
              ref={(el) => el?.focus()}
              className="be-canvas-text-editor"
              value={textEditDraft.text}
              style={{ color: textEditDraft.color, fontSize: textEditDraft.fontSize }}
              onChange={(event) => setTextEditDraft((prev) => (prev ? { ...prev, text: event.target.value } : prev))}
              onBlur={() => commitTextEdit()}
              onKeyDown={(event) => {
                // Escape discards the draft (a new box vanishes; an edit
                // reverts to whatever was last committed) instead of
                // committing whatever's currently typed — plain Enter
                // inserts a newline (multi-line text is the whole point of
                // a resizable box), so there's no separate "confirm" key.
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelTextEdit();
                }
                event.stopPropagation(); // don't let the svg's own onKeyDown (Delete/nudge/paste/...) fire while typing
              }}
            />
          </foreignObject>
        )}
      </svg>
      <div
        className="be-canvas-resize-handle"
        onMouseDown={handleResizeStart}
        role="slider"
        aria-label="Resize canvas"
        aria-valuemin={MIN_CANVAS_WIDTH}
        aria-valuenow={effectiveWidth}
        contentEditable={false}
      />
    </div>
  );
}
