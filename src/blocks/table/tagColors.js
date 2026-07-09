/**
 * Notion-style tag color palette for a table's "select" column — assigned
 * once, at option-creation time (see TableHeaderRow's SelectOptionsManager),
 * and stored on the option itself (`{ value, label, color }`) so it stays
 * stable across reorders/removals, the same way Notion's own Select
 * property keeps whatever color a tag was first given.
 */
export const TAG_COLORS = [
  { bg: '#e9e9e7', text: '#32302c' }, // gray (default)
  { bg: '#eee0da', text: '#64473a' }, // brown
  { bg: '#fadec9', text: '#8a4b23' }, // orange
  { bg: '#fdecc8', text: '#8a6116' }, // yellow
  { bg: '#dbeddb', text: '#256029' }, // green
  { bg: '#d3e5ef', text: '#1a5f8a' }, // blue
  { bg: '#e8deee', text: '#5b3a8a' }, // purple
  { bg: '#f5e0e9', text: '#8a3a5f' }, // pink
  { bg: '#ffe2dd', text: '#a13a2f' }, // red
];

/** Cycles through TAG_COLORS by index — deterministic, no randomness. */
export function pickTagColor(index) {
  return TAG_COLORS[((index % TAG_COLORS.length) + TAG_COLORS.length) % TAG_COLORS.length];
}
