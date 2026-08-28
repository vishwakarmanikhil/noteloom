import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectDefaultStyles } from '../../src/react/injectDefaultStyles.js';

const TAG_ID = 'noteloom-default-styles';

describe('injectDefaultStyles', () => {
  let warn;
  let prevEnv;
  beforeEach(() => {
    document.getElementById(TAG_ID)?.remove();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The dev-only notice is suppressed under NODE_ENV=test (vitest's default);
    // flip to 'development' so the deprecation path is exercised here.
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });
  afterEach(() => {
    warn.mockRestore();
    process.env.NODE_ENV = prevEnv;
  });

  it('injects one <style> tag in <head>, idempotently', () => {
    injectDefaultStyles();
    injectDefaultStyles();
    expect(document.head.querySelectorAll(`#${TAG_ID}`)).toHaveLength(1);
    expect(document.getElementById(TAG_ID).textContent.length).toBeGreaterThan(100);
  });

  it('called directly (no `auto`) never warns', () => {
    injectDefaultStyles();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once when `auto: true` first injects, then never again', () => {
    // This file's module instance is isolated, and the two tests above call
    // injectDefaultStyles() without `auto`, so this is the first auto inject.
    injectDefaultStyles({ auto: true });
    injectDefaultStyles({ auto: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/auto-injected.*future major/i);
    expect(warn.mock.calls[0][0]).toMatch(/noteloom\/theme/);
  });
});
