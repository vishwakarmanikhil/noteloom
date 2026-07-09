import { DividerBlock } from './DividerBlock.jsx';
import { genId } from '../../utils/idGen.js';
import { insertSiblingAfter, insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { updateRun } from '../../store/operations.js';
import { DividerIcon } from '../../react/icons.jsx';

function createDividerBlock() {
  return function factory(parentId) {
    return { block: { id: genId(), type: 'divider', parentId, contentIds: [], props: {} }, runs: [] };
  };
}

function toHTML() {
  return '<hr />';
}

function toPlainText() {
  return '---';
}

function fromHTML(node) {
  if (node.tagName !== 'HR') return null;
  return { block: { id: genId(), type: 'divider', parentId: null, contentIds: [], props: {} }, runs: [] };
}

export const dividerBlockType = {
  component: DividerBlock,
  isLeaf: true,
  defaultProps: {},
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Divider',
    icon: DividerIcon,
    keywords: ['divider', 'hr', 'separator', 'line'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) => {
      const run = store.getRun(runId);
      const value = run?.value ?? '';
      store.applyOperation(updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }));

      // seed a paragraph right after so there's always somewhere to type
      // past the divider — it has no run of its own to focus into.
      const dividerId = insertSiblingAfter(store, blockId, createDividerBlock());
      insertSiblingAfterAndFocus(store, dividerId, createTextLeafBlock('paragraph'));
      return dividerId;
    },
  },
};
