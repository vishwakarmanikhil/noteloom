import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { listItemDepth, orderedItemIndex, orderedMarkerText, bulletMarkerText } from '../../src/blocks/listItem/listMarkers.js';

function li(id, parentId, contentIds = [], overrides = {}) {
  return { id, type: 'listItem', parentId, contentIds, props: { ordered: false, titleRunIds: [], ...overrides } };
}

describe('listMarkers: orderedMarkerText / bulletMarkerText cycling by depth', () => {
  it('cycles ordered markers 1,2,3 -> a,b,c -> i,ii,iii -> 1,2,3 again every 3 levels', () => {
    expect(orderedMarkerText(0, 1)).toBe('1.');
    expect(orderedMarkerText(0, 2)).toBe('2.');
    expect(orderedMarkerText(1, 1)).toBe('a.');
    expect(orderedMarkerText(1, 2)).toBe('b.');
    expect(orderedMarkerText(2, 1)).toBe('i.');
    expect(orderedMarkerText(2, 2)).toBe('ii.');
    expect(orderedMarkerText(3, 1)).toBe('1.'); // wraps back around
    expect(orderedMarkerText(4, 1)).toBe('a.');
  });

  it('cycles bullet markers disc -> circle -> square -> disc again every 3 levels', () => {
    expect(bulletMarkerText(0)).toBe('•');
    expect(bulletMarkerText(1)).toBe('◦');
    expect(bulletMarkerText(2)).toBe('▪');
    expect(bulletMarkerText(3)).toBe('•');
  });
});

describe('listMarkers: listItemDepth', () => {
  it('is 0 for a top-level item and increases by 1 per listItem ancestor', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        li('li1', 'root', ['li2']),
        li('li2', 'li1', ['li3']),
        li('li3', 'li2', []),
      ],
      runs: [],
    });

    expect(listItemDepth(store, store.getBlock('li1'))).toBe(0);
    expect(listItemDepth(store, store.getBlock('li2'))).toBe(1);
    expect(listItemDepth(store, store.getBlock('li3'))).toBe(2);
  });
});

describe('listMarkers: orderedItemIndex', () => {
  it('numbers a contiguous run of ordered siblings sequentially starting at 1', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2', 'li3'], props: {} },
        li('li1', 'root', [], { ordered: true }),
        li('li2', 'root', [], { ordered: true }),
        li('li3', 'root', [], { ordered: true }),
      ],
      runs: [],
    });
    const siblingIds = store.getBlock('root').contentIds;

    expect(orderedItemIndex(store, store.getBlock('li1'), siblingIds)).toBe(1);
    expect(orderedItemIndex(store, store.getBlock('li2'), siblingIds)).toBe(2);
    expect(orderedItemIndex(store, store.getBlock('li3'), siblingIds)).toBe(3);
  });

  it('restarts numbering after a non-ordered interruption (bullet item, toggle, or different block type)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2', 'bullet1', 'li3'], props: {} },
        li('li1', 'root', [], { ordered: true }),
        li('li2', 'root', [], { ordered: true }),
        li('bullet1', 'root', [], { ordered: false }),
        li('li3', 'root', [], { ordered: true }),
      ],
      runs: [],
    });
    const siblingIds = store.getBlock('root').contentIds;

    expect(orderedItemIndex(store, store.getBlock('li2'), siblingIds)).toBe(2);
    expect(orderedItemIndex(store, store.getBlock('li3'), siblingIds)).toBe(1); // restarted after bullet1
  });
});
