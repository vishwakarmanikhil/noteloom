import { DateInlineNode } from './DateInlineNode.jsx';
import { genId } from '../../utils/idGen.js';
import { insertInlineRunAtCursor } from '../shared/insertInlineRun.js';

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toHTML(run) {
  const isoDate = run.data?.isoDate ?? '';
  return `<span data-inline-type="date" data-iso-date="${escapeAttr(isoDate)}">${formatDate(isoDate)}</span>`;
}

function toPlainText(run) {
  return formatDate(run.data?.isoDate ?? '');
}

/** Only claims our own `data-inline-type="date"` marker — see select's fromHTML for why. */
function fromHTML(node) {
  if (node.getAttribute?.('data-inline-type') !== 'date') return null;
  return {
    id: genId(),
    type: 'date',
    value: '',
    marks: {},
    data: { isoDate: node.getAttribute('data-iso-date') ?? '' },
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const dateInlineType = {
  component: DateInlineNode,
  isAtomic: true,
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Date',
    keywords: ['date', 'when', 'schedule', 'calendar'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) =>
      insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, () => ({
        id: genId(),
        type: 'date',
        value: '',
        marks: {},
        data: { isoDate: todayIso() },
      })),
  },
};
