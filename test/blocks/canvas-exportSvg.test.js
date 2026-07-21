import { describe, it, expect } from 'vitest';
import { shapeToHTML, buildCanvasSVGMarkup } from '../../src/blocks/canvas/exportSvg.js';

describe('buildCanvasSVGMarkup', () => {
  it('produces a standalone-valid <svg> (xmlns present) sized to the block\'s own width/height', () => {
    const block = { props: { strokes: [], shapes: [], width: 480, height: 320 } };
    const markup = buildCanvasSVGMarkup(block);
    expect(markup).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('viewBox="0 0 1000 1000"');
    expect(markup).toContain('width="480"');
    expect(markup).toContain('height="320"');
  });

  it('bakes one <path> per stroke and the right markup per shape type', () => {
    const block = {
      props: {
        strokes: [{ id: 's1', points: [[0, 0, 0.5], [100, 100, 0.5]], color: '#000', size: 8 }],
        shapes: [
          { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#e03131', strokeWidth: 4 },
          { id: 'a1', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#2f9e44', strokeWidth: 4 },
        ],
        width: 480,
        height: 320,
      },
    };
    const markup = buildCanvasSVGMarkup(block);
    expect(markup).toContain('<path');
    expect(markup).toContain('<rect');
    expect(markup).toContain('<line');
    expect(markup).toContain('<polygon'); // the arrow's own arrowhead
  });

  it('an empty canvas still produces a valid (if content-free) <svg>', () => {
    const block = { props: { strokes: [], shapes: [], width: 480, height: 320 } };
    const markup = buildCanvasSVGMarkup(block);
    expect(markup).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="480" height="320"></svg>');
  });
});

describe('shapeToHTML', () => {
  it('returns an empty string for an unrecognized shape type', () => {
    expect(shapeToHTML({ type: 'not-a-real-type', x: 0, y: 0, width: 10, height: 10, color: '#000' })).toBe('');
  });
});
