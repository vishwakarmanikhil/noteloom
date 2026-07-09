import { describe, it, expect } from 'vitest';
import { TAG_COLORS, pickTagColor } from '../../src/blocks/table/tagColors.js';

describe('pickTagColor', () => {
  it('cycles through the palette by index', () => {
    expect(pickTagColor(0)).toBe(TAG_COLORS[0]);
    expect(pickTagColor(1)).toBe(TAG_COLORS[1]);
    expect(pickTagColor(TAG_COLORS.length)).toBe(TAG_COLORS[0]); // wraps around
    expect(pickTagColor(TAG_COLORS.length + 2)).toBe(TAG_COLORS[2]);
  });

  it('never returns undefined for a negative or huge index', () => {
    expect(pickTagColor(-1)).toBeDefined();
    expect(pickTagColor(9999)).toBeDefined();
  });
});
