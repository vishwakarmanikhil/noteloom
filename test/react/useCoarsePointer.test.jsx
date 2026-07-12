import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useCoarsePointer } from '../../src/react/useCoarsePointer.js';

function makeMatchMedia(matches) {
  return () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} });
}

function firePointerDown(pointerType) {
  // jsdom has no PointerEvent constructor — a plain Event with pointerType
  // grafted on is enough, since the hook only ever reads event.pointerType.
  const event = new Event('pointerdown');
  event.pointerType = pointerType;
  window.dispatchEvent(event);
}

const originalMatchMedia = window.matchMedia;
const TOUCH_CLASS = 'be-touch-input';

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  document.documentElement.classList.remove(TOUCH_CLASS);
});

function Probe() {
  const isCoarse = useCoarsePointer();
  return <span data-testid="probe">{String(isCoarse)}</span>;
}

describe('useCoarsePointer', () => {
  it('reflects matchMedia(pointer: coarse).matches as the initial guess', () => {
    window.matchMedia = makeMatchMedia(true);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('true');
  });

  it('defaults to false when matchMedia is unavailable', () => {
    window.matchMedia = undefined;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('false');
  });

  it('switches on for a real touch/pen pointerdown, regardless of the initial media-query guess', () => {
    window.matchMedia = makeMatchMedia(false); // e.g. a touchscreen laptop reporting "fine" as primary
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('false');

    act(() => firePointerDown('touch'));
    expect(getByTestId('probe').textContent).toBe('true');
  });

  it('switches back off for a real mouse pointerdown — a hybrid device can flip either way live', () => {
    window.matchMedia = makeMatchMedia(true);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('true');

    act(() => firePointerDown('mouse'));
    expect(getByTestId('probe').textContent).toBe('false');
  });

  it('mirrors the value onto document.documentElement as the be-touch-input class', () => {
    window.matchMedia = makeMatchMedia(false);
    render(<Probe />);
    expect(document.documentElement.classList.contains(TOUCH_CLASS)).toBe(false);

    act(() => firePointerDown('touch'));
    expect(document.documentElement.classList.contains(TOUCH_CLASS)).toBe(true);
  });
});
