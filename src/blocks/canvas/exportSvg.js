import { getStrokeOutlinePath } from './strokeOutline.js';
import { arrowheadPoints, diamondPoints, trianglePoints, starPoints } from './shapeGeometry.js';
import { escapeAttr, escapeHTML } from '../../inline/marks.js';

const POLYGON_POINTS_BY_TYPE = { diamond: diamondPoints, triangle: trianglePoints, star: starPoints };

/**
 * Bakes one shape (rectangle/ellipse/arrow/text/diamond/triangle/star) to
 * markup — reusing the exact same `arrowheadPoints`/`*Points` functions the
 * live `ShapeElement` renders with, so export always matches on-screen.
 * `fillColor` (rect/ellipse/diamond/triangle/star only) defaults to
 * `fill="none"` when unset, matching `ShapeElement`. A non-zero `rotation`
 * (rect/ellipse/diamond/triangle/star/text only — arrows are never
 * rotated, see CanvasBlock.jsx's own doc comment on rotation's scope) wraps
 * the markup in a `<g rotate()>`, the same pivot (bounding-box center)
 * `ShapeElement` uses.
 */
export function shapeToHTML(shape) {
  const strokeWidth = shape.strokeWidth ?? 8;
  const color = escapeAttr(shape.color);
  if (shape.type === 'arrow') {
    const headSize = Math.max(16, strokeWidth * 3);
    const head = arrowheadPoints(shape.x1, shape.y1, shape.x2, shape.y2, headSize);
    const points = head.map(([x, y]) => `${x},${y}`).join(' ');
    return (
      `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${color}" stroke-width="${strokeWidth}"></line>` +
      `<polygon points="${points}" fill="${color}"></polygon>`
    );
  }
  const fill = shape.fillColor ? escapeAttr(shape.fillColor) : 'none';
  let content;
  if (shape.type === 'rectangle') {
    content = `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"></rect>`;
  } else if (shape.type === 'ellipse') {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    content = `<ellipse cx="${cx}" cy="${cy}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"></ellipse>`;
  } else if (shape.type === 'text') {
    // Same <foreignObject><div> approach as the live ShapeElement — real
    // browser text wrapping, not reimplemented SVG <text>/<tspan> layout.
    // `white-space:pre-wrap` alone (no manual <br> conversion) renders raw
    // newline characters as line breaks, matching how the live component's
    // own `{shape.text}` React text node renders under the same CSS.
    const fontSize = shape.fontSize ?? 28;
    const text = escapeHTML(shape.text ?? '');
    content =
      `<foreignObject x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;color:${color};font-size:${fontSize}px;line-height:1.3;white-space:pre-wrap;word-break:break-word;">${text}</div>` +
      `</foreignObject>`;
  } else {
    const pointsFn = POLYGON_POINTS_BY_TYPE[shape.type];
    if (!pointsFn) return '';
    const rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    const points = pointsFn(rect)
      .map(([x, y]) => `${x},${y}`)
      .join(' ');
    content = `<polygon points="${points}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"></polygon>`;
  }
  if (!shape.rotation) return content;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  return `<g transform="rotate(${shape.rotation} ${cx} ${cy})">${content}</g>`;
}

/**
 * Bakes a canvas block's `strokes`/`shapes` into one self-contained
 * `<svg>...</svg>` string — reusing the exact same `getStrokeOutlinePath`/
 * `shapeToHTML` functions the live component renders with, so this always
 * matches what's on screen. Shared by two call sites that both need the
 * SAME markup for two different purposes (this module exists specifically
 * to let them both import it without a circular dependency — `index.js`'s
 * own `toHTML` needs `CanvasBlock.jsx` for its `component` field, and
 * `CanvasBlock.jsx`'s PNG-export button needs this markup, so this couldn't
 * live in either of those two files without one importing the other):
 *   - `index.js`'s `toHTML` embeds it inline in exported document HTML.
 *   - `CanvasBlock.jsx`'s "Export PNG" button loads it into an `Image` (via
 *     an `xmlns`-qualified, standalone-valid SVG document — required for a
 *     browser to parse it outside an HTML embedding context) and rasterizes
 *     that onto an offscreen `<canvas>`.
 */
export function buildCanvasSVGMarkup(block) {
  const { strokes = [], shapes = [], width, height } = block.props;
  const paths = strokes
    .map(
      (stroke) =>
        `<path fill="${escapeAttr(stroke.color)}" d="${getStrokeOutlinePath(stroke.points, { size: stroke.size })}"></path>`,
    )
    .join('');
  const shapeMarkup = shapes.map(shapeToHTML).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="${width}" height="${height}">${paths}${shapeMarkup}</svg>`;
}
