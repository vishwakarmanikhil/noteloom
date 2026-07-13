import { describe, it, expect, afterEach, vi } from 'vitest';
import { announce } from '../../src/react/liveAnnouncer.js';

const LIVE_REGION_ID = 'be-live-region';

afterEach(() => {
  document.getElementById(LIVE_REGION_ID)?.remove();
  vi.useRealTimers();
});

describe('liveAnnouncer', () => {
  it('creates one visually-hidden aria-live region, appended to <body>', () => {
    announce('Hello');
    const region = document.getElementById(LIVE_REGION_ID);
    expect(region).not.toBeNull();
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.parentElement).toBe(document.body);
    // visually hidden but not display:none/visibility:hidden (which would
    // also hide it from assistive tech, defeating the point)
    expect(region.style.position).toBe('absolute');
    expect(region.style.width).toBe('1px');
  });

  it('is idempotent — calling it repeatedly never creates a second region', () => {
    announce('One');
    announce('Two');
    announce('Three');
    expect(document.querySelectorAll(`#${LIVE_REGION_ID}`)).toHaveLength(1);
  });

  it('sets the region text to the announced message (after the clear-then-set tick)', () => {
    vi.useFakeTimers();
    announce('Block deleted');
    vi.runAllTimers();
    expect(document.getElementById(LIVE_REGION_ID).textContent).toBe('Block deleted');
  });

  it('re-announcing the exact same message still results in the text being cleared then re-set (not silently skipped)', () => {
    vi.useFakeTimers();
    announce('Block deleted');
    vi.runAllTimers();
    const region = document.getElementById(LIVE_REGION_ID);
    expect(region.textContent).toBe('Block deleted');

    announce('Block deleted');
    // cleared synchronously before the re-set timer fires
    expect(region.textContent).toBe('');
    vi.runAllTimers();
    expect(region.textContent).toBe('Block deleted');
  });
});
