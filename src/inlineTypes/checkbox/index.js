import { CheckboxInlineNode } from './CheckboxInlineNode.jsx';
import { genId } from '../../utils/idGen.js';
import { insertInlineRunAtCursor } from '../shared/insertInlineRun.js';
import { CheckboxIcon } from '../../react/icons.jsx';

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, '&quot;');
}

function toHTML(run) {
  const { checked = false, label = '' } = run.data ?? {};
  return `<span data-inline-type="checkbox" data-checked="${checked}">${checked ? '☑' : '☐'} ${escapeHTML(label)}</span>`;
}

function toPlainText(run) {
  const { checked = false, label = '' } = run.data ?? {};
  return `${checked ? '[x]' : '[ ]'} ${label}`.trim();
}

/** Only claims our own `data-inline-type="checkbox"` marker — see select's fromHTML for why. */
function fromHTML(node) {
  if (node.getAttribute?.('data-inline-type') !== 'checkbox') return null;
  return {
    id: genId(),
    type: 'checkbox',
    value: '',
    marks: {},
    data: { checked: node.getAttribute('data-checked') === 'true', label: (node.textContent ?? '').replace(/^[☑☐]\s*/, '') },
  };
}

export const checkboxInlineType = {
  component: CheckboxInlineNode,
  isAtomic: true,
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Checkbox',
    icon: CheckboxIcon,
    keywords: ['checkbox', 'todo', 'check', 'toggle'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) =>
      insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, () => ({
        id: genId(),
        type: 'checkbox',
        value: '',
        marks: {},
        data: { checked: false, label: '' },
      })),
  },
};
