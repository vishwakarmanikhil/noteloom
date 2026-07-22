const ALPHA_START = 'a'.charCodeAt(0);
const ROMAN_TABLE = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** 1 -> "a", 26 -> "z", 27 -> "aa", ... (spreadsheet-column style, no zero digit). */
function toAlpha(n) {
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(ALPHA_START + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function toRoman(n) {
  let out = '';
  let rest = n;
  for (const [value, symbol] of ROMAN_TABLE) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/**
 * A "plain" list item is one whose marker is a bullet/number (not a to-do
 * checkbox, not a toggle disclosure triangle) — only these participate in
 * numbering/bullet-style cycling at all.
 */
function isPlainMarkerItem(block) {
  return block?.type === 'listItem' && block.props?.checked === undefined && block.props?.collapsed === undefined;
}

/**
 * How many listItem ancestors this block is nested under — 0 for a
 * top-level item, 1 for its first nested level, and so on. Cycles every 3
 * levels for marker style (a common numbered-list convention:
 * 1,2,3 -> a,b,c -> i,ii,iii -> 1,2,3 again as you keep nesting), applied
 * uniformly regardless of whether ancestors at those levels happen to be
 * ordered, bulleted, or a mix.
 */
export function listItemDepth(store, block) {
  let depth = 0;
  let current = block;
  while (current) {
    const parent = store.getBlock(current.parentId);
    if (!parent || parent.type !== 'listItem') break;
    depth += 1;
    current = parent;
  }
  return depth;
}

/**
 * This item's 1-based position within its *contiguous run* of ordered
 * sibling list items — counting backward from this item only while
 * immediately-preceding siblings are also plain ordered list items, so
 * numbering restarts at 1 after any interruption (a bullet item, a toggle,
 * a to-do, or a completely different block type) — a numbered list restarts
 * after a break rather than continuing a global counter across the whole
 * document.
 */
export function orderedItemIndex(store, block, siblingIds) {
  const pos = siblingIds.indexOf(block.id);
  let count = 1;
  for (let i = pos - 1; i >= 0; i -= 1) {
    const sibling = store.getBlock(siblingIds[i]);
    if (!isPlainMarkerItem(sibling) || !sibling.props.ordered) break;
    count += 1;
  }
  return count;
}

/** e.g. depth 0 -> "1.", depth 1 -> "a.", depth 2 -> "i.", depth 3 -> "1." again. */
export function orderedMarkerText(depth, index) {
  const style = ((depth % 3) + 3) % 3;
  if (style === 0) return `${index}.`;
  if (style === 1) return `${toAlpha(index)}.`;
  return `${toRoman(index)}.`;
}

const BULLET_GLYPHS = ['•', '◦', '▪'];

/** e.g. depth 0 -> "•" (disc), depth 1 -> "◦" (circle), depth 2 -> "▪" (square), depth 3 -> "•" again. */
export function bulletMarkerText(depth) {
  const style = ((depth % 3) + 3) % 3;
  return BULLET_GLYPHS[style];
}
