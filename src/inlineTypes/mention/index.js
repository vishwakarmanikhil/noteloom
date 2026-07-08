import { MentionInlineNode } from './MentionInlineNode.jsx';
import { genId } from '../../utils/idGen.js';
import { insertInlineRunAtCursor } from '../shared/insertInlineRun.js';

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function toHTML(run) {
  const label = run.data?.label ?? '';
  return `<span data-inline-type="mention" data-mention-id="${escapeAttr(run.data?.mentionId ?? '')}">@${label}</span>`;
}

function toPlainText(run) {
  return run.data?.label ? `@${run.data.label}` : '';
}

/** Only claims our own `data-inline-type="mention"` marker — see select's fromHTML for why. */
function fromHTML(node) {
  if (node.getAttribute?.('data-inline-type') !== 'mention') return null;
  return {
    id: genId(),
    type: 'mention',
    value: '',
    marks: {},
    data: {
      mentionId: node.getAttribute('data-mention-id') ?? '',
      label: (node.textContent ?? '').replace(/^@/, ''),
    },
  };
}

export const mentionInlineType = {
  component: MentionInlineNode,
  isAtomic: true,
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Mention',
    keywords: ['mention', '@', 'person', 'user'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) =>
      insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, () => ({
        id: genId(),
        type: 'mention',
        value: '',
        marks: {},
        data: { mentionId: '', label: '' },
      })),
  },
};
