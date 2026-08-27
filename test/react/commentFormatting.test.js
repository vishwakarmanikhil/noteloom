import { describe, it, expect } from 'vitest';
import {
  getAvatarColor,
  getInitials,
  formatRelativeTime,
} from '../../src/react/commentFormatting.js';

describe('getInitials', () => {
  it('takes the first letter of each of the first two words for a "First Last" name', () => {
    expect(getInitials('Bailey Chen')).toBe('BC');
  });

  it('takes the first two characters of a single word', () => {
    expect(getInitials('alice')).toBe('AL');
  });

  it('returns "?" for empty/missing input', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });
});

describe('getAvatarColor', () => {
  it('is deterministic -- the same authorId always gets the same color', () => {
    expect(getAvatarColor('alice')).toBe(getAvatarColor('alice'));
  });

  it('returns a hex color string', () => {
    expect(getAvatarColor('bob')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-24T12:00:00Z').getTime();

  it('reports "just now" for under a minute', () => {
    expect(formatRelativeTime(now - 30 * 1000, now)).toBe('just now');
  });

  it('reports minutes for under an hour', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5 mins ago');
    expect(formatRelativeTime(now - 1 * 60 * 1000, now)).toBe('1 min ago');
  });

  it('reports hours for under a day', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, now)).toBe('3 hours ago');
  });

  it('reports days for under a week', () => {
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, now)).toBe('2 days ago');
  });

  it('falls back to a locale date beyond a week', () => {
    const result = formatRelativeTime(now - 10 * 24 * 60 * 60 * 1000, now);
    expect(result).not.toMatch(/ago$/);
  });
});
