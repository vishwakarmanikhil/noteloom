/**
 * Finds the common-prefix/common-suffix boundary between two strings,
 * operating on Unicode code points (via `Array.from`) rather than raw
 * UTF-16 units, so a surrogate pair can never be split across two
 * character-CRDT slots. Returns the changed region as code-point indices:
 * `oldChars[start, oldEnd)` was removed, `newChars[start, newEnd)` was
 * inserted in its place — everything outside `[start, max(oldEnd,newEnd))`
 * is unchanged. Same algorithm as History's own `diffValueOffsets` (used
 * there purely for caret-position cosmetics on a UTF-16 string), reused
 * here for the actual data-merge boundary, which is why it needs to be
 * code-point aware rather than just close enough.
 */
export function diffCodePoints(oldValue, newValue) {
  const oldChars = Array.from(oldValue ?? '');
  const newChars = Array.from(newValue ?? '');
  let start = 0;
  const maxStart = Math.min(oldChars.length, newChars.length);
  while (start < maxStart && oldChars[start] === newChars[start]) start += 1;

  let oldEnd = oldChars.length;
  let newEnd = newChars.length;
  while (oldEnd > start && newEnd > start && oldChars[oldEnd - 1] === newChars[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return { start, oldEnd, newEnd, oldChars, newChars };
}
