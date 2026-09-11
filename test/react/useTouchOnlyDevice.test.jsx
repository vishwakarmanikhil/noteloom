import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useTouchOnlyDevice } from '../../src/react/useTouchOnlyDevice.js';

function makeMatchMedia(matches) {
  const listeners = new Set();
  const mql = {
    matches,
    addEventListener: (type, cb) => listeners.add(cb),
    removeEventListener: (type, cb) => listeners.delete(cb),
    _fireChange: (nextMatches) => {
      mql.matches = nextMatches;
      listeners.forEach((cb) => cb());
    },
  };
  return { fn: () => mql, mql };
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function Probe() {
  const isTouchOnly = useTouchOnlyDevice();
  return <span data-testid="probe">{String(isTouchOnly)}</span>;
}

describe('useTouchOnlyDevice', () => {
  it('reflects "(hover: none) and (pointer: coarse)" as the initial value — a phone/tablet', () => {
    window.matchMedia = makeMatchMedia(true).fn;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('true');
  });

  it('is false on a laptop touchscreen (trackpad/mouse as primary, so hover:hover matches instead)', () => {
    window.matchMedia = makeMatchMedia(false).fn;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('false');
  });

  it('does NOT flip just because a touch event fires — unlike useCoarsePointer, this is a static device classification', () => {
    window.matchMedia = makeMatchMedia(false).fn;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('false');

    act(() =>
      window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' })),
    );
    expect(getByTestId('probe').textContent).toBe('false'); // still false: no listener for this at all
  });

  it('reacts to the media query itself changing (e.g. an external mouse attached to/detached from a tablet)', () => {
    const { fn, mql } = makeMatchMedia(true);
    window.matchMedia = fn;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('true');

    act(() => mql._fireChange(false)); // a mouse got attached
    expect(getByTestId('probe').textContent).toBe('false');
  });

  it('defaults to false when matchMedia is unavailable', () => {
    window.matchMedia = undefined;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('false');
  });
});
