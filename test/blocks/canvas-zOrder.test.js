import { describe, it, expect } from 'vitest';
import { orderedDrawables, nextZIndex, minZIndex } from '../../src/blocks/canvas/zOrder.js';

function stroke(id, z) {
  return z === undefined ? { id, points: [[0, 0, 0.5]] } : { id, points: [[0, 0, 0.5]], z };
}

function shape(id, z) {
  return z === undefined
    ? { id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }
    : { id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, z };
}

describe('orderedDrawables: legacy (no z) documents', () => {
  it('keeps every stroke below every shape, in their own array order — the old fixed two-layer behavior', () => {
    const strokes = [stroke('s1'), stroke('s2')];
    const shapes = [shape('h1'), shape('h2')];
    expect(orderedDrawables(strokes, shapes).map((d) => d.item.id)).toEqual([
      's1',
      's2',
      'h1',
      'h2',
    ]);
  });
});

describe('orderedDrawables: mixed legacy + z-stamped documents', () => {
  it('a stroke with an explicit z drawn "after" existing shapes renders on top of all of them', () => {
    const shapes = [shape('h1'), shape('h2')]; // legacy, no z
    const newZ = nextZIndex([], shapes);
    const strokes = [stroke('s1', newZ)]; // drawn just now, on top
    expect(orderedDrawables(strokes, shapes).map((d) => d.item.id)).toEqual(['h1', 'h2', 's1']);
  });

  it('a shape drawn after a z-stamped stroke renders on top of it in turn', () => {
    const strokes = [stroke('s1', 0)];
    const newZ = nextZIndex(strokes, []);
    const shapes = [shape('h1', newZ)];
    expect(orderedDrawables(strokes, shapes).map((d) => d.item.id)).toEqual(['s1', 'h1']);
  });
});

describe('nextZIndex / minZIndex', () => {
  it('nextZIndex is always above every existing effective z, legacy or explicit', () => {
    const strokes = [stroke('s1'), stroke('s2', 500)];
    const shapes = [shape('h1'), shape('h2', 10)];
    const z = nextZIndex(strokes, shapes);
    const all = orderedDrawables(strokes, shapes).map((d) => d.z);
    expect(z).toBeGreaterThan(Math.max(...all));
  });

  it('minZIndex is always below every existing effective z', () => {
    const strokes = [stroke('s1'), stroke('s2', 500)];
    const shapes = [shape('h1'), shape('h2', 10)];
    const z = minZIndex(strokes, shapes);
    const all = orderedDrawables(strokes, shapes).map((d) => d.z);
    expect(z).toBeLessThan(Math.min(...all));
  });

  it('on an empty canvas, nextZIndex starts at 0', () => {
    expect(nextZIndex([], [])).toBe(0);
  });
});
