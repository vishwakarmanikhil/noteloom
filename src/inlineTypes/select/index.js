import { SelectInlineNode } from './SelectInlineNode.jsx';
import { genId } from '../../utils/idGen.js';
import { insertInlineRunAtCursor } from '../shared/insertInlineRun.js';

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function selectedLabel(run) {
  const { options = [], selectedValue = '' } = run.data ?? {};
  return options.find((opt) => opt.value === selectedValue)?.label ?? '';
}

function toHTML(run) {
  const label = selectedLabel(run) || run.data?.placeholder || '';
  return `<span data-inline-type="select" data-selected-value="${escapeAttr(run.data?.selectedValue ?? '')}">${label}</span>`;
}

function toPlainText(run) {
  return selectedLabel(run);
}

/**
 * Only claims nodes carrying our own `data-inline-type="select"` marker —
 * i.e. lossless same-editor round-trips (the app-specific clipboard JSON
 * path already round-trips runs directly without going through HTML at
 * all; this fromHTML exists for the text/html clipboard fallback). Foreign
 * HTML from another app has no such marker and correctly falls through to
 * plain text, since there's no way to know what a "select" from another
 * app's DOM even means.
 */
function fromHTML(node) {
  if (node.getAttribute?.('data-inline-type') !== 'select') return null;
  return {
    id: genId(),
    type: 'select',
    value: '',
    marks: {},
    data: {
      options: [],
      selectedValue: node.getAttribute('data-selected-value') ?? '',
    },
  };
}

export const selectInlineType = {
  component: SelectInlineNode,
  isAtomic: true,
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Select',
    keywords: ['select', 'dropdown', 'choice', 'picker'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) =>
      insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, () => ({
        id: genId(),
        type: 'select',
        value: '',
        marks: {},
        data: { options: [], selectedValue: '', placeholder: 'Select…' },
      })),
  },
};
