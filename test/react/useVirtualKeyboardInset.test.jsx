import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useVirtualKeyboardInset } from '../../src/react/useVirtualKeyboardInset.js';

function makeVisualViewport(initialHeight, offsetTop = 0) {
  let height = initialHeight;
  const listeners = { resize: new Set(), scroll: new Set() };
  return {
    get height() {
      return height;
    },
    offsetTop,
    addEventListener: (event, cb) => listeners[event]?.add(cb),
    removeEventListener: (event, cb) => listeners[event]?.delete(cb),
    fire: (event) => listeners[event]?.forEach((cb) => cb()),
    setHeight: (h) => {
      height = h;
    },
  };
}

function Probe() {
  const inset = useVirtualKeyboardInset();
  return <span data-testid="probe">{inset}</span>;
}

const originalVisualViewport = window.visualViewport;
const originalInnerHeight = window.innerHeight;

afterEach(() => {
  window.visualViewport = originalVisualViewport;
  window.innerHeight = originalInnerHeight;
});

describe('useVirtualKeyboardInset', () => {
  it('is 0 when there is no visualViewport at all', () => {
    window.visualViewport = undefined;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('0');
  });

  it('is 0 when the visual viewport still matches the full layout height (no keyboard)', () => {
    window.innerHeight = 800;
    window.visualViewport = makeVisualViewport(800, 0);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('0');
  });

  it('reports the gap between layout height and the shrunk visual viewport, and updates on resize', () => {
    window.innerHeight = 800;
    const vv = makeVisualViewport(800, 0);
    window.visualViewport = vv;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('0');

    act(() => {
      vv.setHeight(500); // keyboard opened, covering 300px
      vv.fire('resize');
    });
    expect(getByTestId('probe').textContent).toBe('300');
  });
});
