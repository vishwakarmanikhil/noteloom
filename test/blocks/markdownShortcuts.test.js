import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { applyMarkdownShortcut } from '../../src/blocks/paragraph/markdownShortcuts.js';

function makeDoc(text) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: text, marks: {} }],
  };
}

const NBSP = ' ';

describe('applyMarkdownShortcut: regression — browsers insert a non-breaking space (U+00A0), not a plain " ", for a trailing space in contentEditable', () => {
  it('every space-triggered rule also matches when the trigger space is actually U+00A0', () => {
    const cases = [
      [`#${NBSP}`, 'heading', { level: 1 }],
      [`##${NBSP}`, 'heading', { level: 2 }],
      [`-${NBSP}`, 'listItem', { ordered: false }],
      [`*${NBSP}`, 'listItem', { ordered: false }],
      [`1.${NBSP}`, 'listItem', { ordered: true }],
      [`[]${NBSP}`, 'listItem', { ordered: false, checked: false }],
      [`>${NBSP}`, 'blockquote', {}],
    ];
    for (const [text, expectedType, expectedProps] of cases) {
      const store = new EditorStore(makeDoc(text));
      const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
      expect(handled, `expected "${text}" to convert`).toBe(true);
      const newBlock = store.getBlock(store.getBlock('root').contentIds[0]);
      expect(newBlock.type, `"${text}" -> type`).toBe(expectedType);
      for (const key of Object.keys(expectedProps)) {
        expect(newBlock.props[key], `"${text}" -> props.${key}`).toBe(expectedProps[key]);
      }
    }
  });

  it('code block ("```") is unaffected either way, since it never involves a trigger space', () => {
    const store = new EditorStore(makeDoc('```'));
    expect(applyMarkdownShortcut(store, 'p1', [store.getRun('r1')])).toBe(true);
    expect(store.getBlock(store.getBlock('root').contentIds[0]).type).toBe('code');
  });
});

describe('applyMarkdownShortcut', () => {
  it('"# " converts to a level-1 heading, stripping the prefix and keeping the run id', () => {
    const store = new EditorStore(makeDoc('# '));
    const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);

    expect(handled).toBe(true);
    const newId = store.getBlock('root').contentIds[0];
    expect(newId).toBe('p1'); // conversion is in-place, same id — not deleted and replaced
    const newBlock = store.getBlock(newId);
    expect(newBlock.type).toBe('heading');
    expect(newBlock.props.level).toBe(1);
    expect(newBlock.contentIds).toEqual(['r1']);
    expect(store.getRun('r1').value).toBe(''); // prefix stripped, run reused
  });

  it('"## " and "### " convert to level-2/level-3 headings', () => {
    const store2 = new EditorStore(makeDoc('## '));
    applyMarkdownShortcut(store2, 'p1', [store2.getRun('r1')]);
    expect(store2.getBlock(store2.getBlock('root').contentIds[0]).props.level).toBe(2);

    const store3 = new EditorStore(makeDoc('### '));
    applyMarkdownShortcut(store3, 'p1', [store3.getRun('r1')]);
    expect(store3.getBlock(store3.getBlock('root').contentIds[0]).props.level).toBe(3);
  });

  it('"#### " (four #) does not match — only 1-3 are supported headings', () => {
    const store = new EditorStore(makeDoc('#### '));
    const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    expect(handled).toBe(false);
    expect(store.getBlock('p1')).toBeDefined();
  });

  it('"- " and "* " convert to an unordered list item', () => {
    const storeDash = new EditorStore(makeDoc('- '));
    applyMarkdownShortcut(storeDash, 'p1', [storeDash.getRun('r1')]);
    const dashBlock = storeDash.getBlock(storeDash.getBlock('root').contentIds[0]);
    expect(dashBlock.type).toBe('listItem');
    expect(dashBlock.props.ordered).toBe(false);
    expect(dashBlock.props.titleRunIds).toEqual(['r1']);

    const storeStar = new EditorStore(makeDoc('* '));
    applyMarkdownShortcut(storeStar, 'p1', [storeStar.getRun('r1')]);
    expect(storeStar.getBlock(storeStar.getBlock('root').contentIds[0]).type).toBe('listItem');
  });

  it('"1. " (any digit sequence) converts to an ordered list item', () => {
    const store = new EditorStore(makeDoc('1. '));
    applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    const newBlock = store.getBlock(store.getBlock('root').contentIds[0]);
    expect(newBlock.type).toBe('listItem');
    expect(newBlock.props.ordered).toBe(true);

    const store42 = new EditorStore(makeDoc('42. '));
    applyMarkdownShortcut(store42, 'p1', [store42.getRun('r1')]);
    expect(store42.getBlock(store42.getBlock('root').contentIds[0]).props.ordered).toBe(true);
  });

  it('"[] " converts to a to-do (checked) list item', () => {
    const store = new EditorStore(makeDoc('[] '));
    applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    const newBlock = store.getBlock(store.getBlock('root').contentIds[0]);
    expect(newBlock.type).toBe('listItem');
    expect(newBlock.props.checked).toBe(false);
  });

  it('"> " converts to a blockquote', () => {
    const store = new EditorStore(makeDoc('> '));
    applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    expect(store.getBlock(store.getBlock('root').contentIds[0]).type).toBe('blockquote');
  });

  it('"```" (no trailing space needed) converts to a code block', () => {
    const store = new EditorStore(makeDoc('```'));
    const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    expect(handled).toBe(true);
    const newBlock = store.getBlock(store.getBlock('root').contentIds[0]);
    expect(newBlock.type).toBe('code');
    expect(newBlock.props.language).toBe('plaintext');
  });

  it('only fires exactly when the trigger completes, not before or after (real typing is one call per keystroke)', () => {
    // "- " alone (right when the trigger space lands) matches and converts;
    // one keystroke earlier ("-") or later ("- b") it must not, since a
    // real caller re-checks on every keystroke and re-triggering after the
    // block already converted (a completely different component by then)
    // isn't reachable in practice — this guards the regex itself, which is
    // what actually prevents that.
    const storeBefore = new EditorStore(makeDoc('-'));
    expect(applyMarkdownShortcut(storeBefore, 'p1', [storeBefore.getRun('r1')])).toBe(false);

    const store = new EditorStore(makeDoc('- '));
    expect(applyMarkdownShortcut(store, 'p1', [store.getRun('r1')])).toBe(true);

    const storeAfter = new EditorStore(makeDoc('- b'));
    expect(applyMarkdownShortcut(storeAfter, 'p1', [storeAfter.getRun('r1')])).toBe(false);
  });

  it('does not fire mid-sentence (prefix must be at the very start)', () => {
    const store = new EditorStore(makeDoc('well - actually '));
    const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1')]);
    expect(handled).toBe(false);
  });

  it('does not fire across multiple runs (only a single plain text run)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: '- ', marks: {} },
        { id: 'r2', type: 'text', value: 'more', marks: {} },
      ],
    });
    const handled = applyMarkdownShortcut(store, 'p1', [store.getRun('r1'), store.getRun('r2')]);
    expect(handled).toBe(false);
  });

  it('is one atomic undo step through History', () => {
    const store = new EditorStore(makeDoc('- '));
    const history = new History(store);

    applyMarkdownShortcut(history, 'p1', [history.getRun('r1')]);
    const newId = history.getBlock('root').contentIds[0];
    expect(history.getBlock(newId).type).toBe('listItem');

    history.undo();
    expect(history.getBlock('p1')).toBeDefined();
    expect(history.getBlock('p1').type).toBe('paragraph');
    expect(history.getRun('r1').value).toBe('- ');
  });
});
