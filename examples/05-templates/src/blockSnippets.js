import { EditorStore, captureBlockTemplate } from 'noteloom';

// Developer-defined block snippets: build a throwaway document containing
// exactly the blocks you want to offer, capture it once, then register the
// capture -- registerBlockTemplates (in App.jsx) makes it insertable via "/"
// alongside every built-in block, no rendering/UI code of its own needed.
function capture(blocks, runs, rootIds) {
  const store = new EditorStore({
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: rootIds, props: {} }, ...blocks],
    runs,
  });
  return captureBlockTemplate(store, rootIds);
}

const agenda = capture(
  [
    { id: 'heading1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 2 } },
    { id: 'item1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: true, titleRunIds: ['r2'] } },
    { id: 'item2', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: true, titleRunIds: ['r3'] } },
    { id: 'item3', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: true, titleRunIds: ['r4'] } },
  ],
  [
    { id: 'r1', type: 'text', value: 'Meeting agenda', marks: {} },
    { id: 'r2', type: 'text', value: 'Review previous action items', marks: {} },
    { id: 'r3', type: 'text', value: 'Discuss...', marks: {} },
    { id: 'r4', type: 'text', value: 'Next steps', marks: {} },
  ],
  ['heading1', 'item1', 'item2', 'item3'],
);

const actionItems = capture(
  [
    { id: 'heading2', type: 'heading', parentId: 'root', contentIds: ['r5'], props: { level: 2 } },
    { id: 'todo1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, checked: false, titleRunIds: ['r6'] } },
  ],
  [
    { id: 'r5', type: 'text', value: 'Action items', marks: {} },
    { id: 'r6', type: 'text', value: '', marks: {} },
  ],
  ['heading2', 'todo1'],
);

export const blockSnippets = [
  { id: 'agenda', label: 'Meeting agenda', keywords: ['agenda', 'meeting'], roots: agenda.roots },
  { id: 'action-items', label: 'Action items', keywords: ['todo', 'action'], roots: actionItems.roots },
];
