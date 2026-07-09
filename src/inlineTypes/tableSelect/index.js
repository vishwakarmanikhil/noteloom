import { TableSelectInlineNode } from './TableSelectInlineNode.jsx';
import { genId } from '../../utils/idGen.js';

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, '&quot;');
}

// `run.data.selectedLabel` is a denormalized cache of the currently
// selected option's label (kept in sync by TableSelectInlineNode's
// onChange and by setColumnOptions whenever the column's shared options
// change) — deliberately redundant with the column's own options list, so
// toHTML/toPlainText/fromHTML never need table/column context (which
// serialization call sites don't have) to render a sensible value.
function toHTML(run) {
  const { selectedValue = '', selectedLabel = '' } = run.data ?? {};
  return `<span data-inline-type="tableSelect" data-selected-value="${escapeAttr(selectedValue)}">${escapeHTML(selectedLabel)}</span>`;
}

function toPlainText(run) {
  return run.data?.selectedLabel ?? '';
}

/**
 * Only claims nodes carrying our own `data-inline-type="tableSelect"`
 * marker (see select's fromHTML for why). The reconstructed run has no
 * knowledge of which column it'll end up in on paste — the pasted label
 * is taken at face value, and its `selectedValue` will only match an
 * actual column option again if the destination table happens to have one
 * with the same id, which is possible but not guaranteed for a same-editor
 * paste; a cross-editor paste always lands as an unmatched value anyway.
 */
function fromHTML(node) {
  if (node.getAttribute?.('data-inline-type') !== 'tableSelect') return null;
  return {
    id: genId(),
    type: 'tableSelect',
    value: '',
    marks: {},
    data: {
      selectedValue: node.getAttribute('data-selected-value') ?? '',
      selectedLabel: node.textContent ?? '',
    },
  };
}

export const tableSelectInlineType = {
  component: TableSelectInlineNode,
  isAtomic: true,
  toHTML,
  toPlainText,
  fromHTML,
  // No slashCommand: unlike select/date/custom field types, this type is never
  // inserted ad-hoc into a paragraph — it only exists inside a table cell
  // whose column type has been set to "select" (see setColumnType).
};
