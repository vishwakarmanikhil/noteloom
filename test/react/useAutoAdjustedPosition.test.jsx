import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useAutoAdjustedPosition } from '../../src/react/useAutoAdjustedPosition.js';

// jsdom never performs real layout, so a plain element's own
// getBoundingClientRect() always reports 0x0 regardless of CSS — the hook
// under test relies on a real measured size to decide whether to clamp, so
// this mock reads a fixed width/height off data attributes instead, letting
// each test control exactly what "the menu's own rendered size" is.
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: Number(this.dataset.mockWidth) || 0,
      height: Number(this.dataset.mockHeight) || 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  };
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

function Harness({ top, left, width, height }) {
  const menuRef = useRef(null);
  const position = useAutoAdjustedPosition(menuRef, true, top, left);
  return (
    <div
      ref={menuRef}
      data-testid="menu"
      data-mock-width={width}
      data-mock-height={height}
      style={{ position: 'fixed', top: position?.top, left: position?.left }}
    />
  );
}

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
});

describe('useAutoAdjustedPosition', () => {
  it('leaves a position that already fits inside the viewport untouched', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    const { getByTestId } = render(<Harness top={100} left={100} width={200} height={100} />);
    const el = getByTestId('menu');
    expect(el.style.top).toBe('100px');
    expect(el.style.left).toBe('100px');
  });

  it('shifts a position back inside the viewport when it would overflow the right/bottom edge', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
    // Anchored near the right/bottom edge with a menu too big to fit there.
    const { getByTestId } = render(<Harness top={280} left={380} width={200} height={100} />);
    const el = getByTestId('menu');
    expect(parseFloat(el.style.left)).toBeLessThanOrEqual(400 - 200);
    expect(parseFloat(el.style.top)).toBeLessThanOrEqual(300 - 100);
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(el.style.top)).toBeGreaterThanOrEqual(0);
  });

  it('returns null (renders nothing) when top/left are not yet known', () => {
    const menuRef = { current: null };
    function NullHarness() {
      const localRef = useRef(null);
      const position = useAutoAdjustedPosition(localRef, true, null, null);
      return <div ref={localRef} data-testid="menu2">{position ? 'has-position' : 'no-position'}</div>;
    }
    const { getByTestId } = render(<NullHarness />);
    expect(getByTestId('menu2').textContent).toBe('no-position');
    expect(menuRef.current).toBeNull();
  });
});
