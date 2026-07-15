import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { resolveBlockDir } from '../../src/blocks/shared/resolveBlockDir.js';

function makeDoc(rootProps = {}, blockProps = {}) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: rootProps },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: blockProps },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
  };
}

describe('resolveBlockDir', () => {
  it('defaults to "auto" when neither the block nor the root set a dir', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveBlockDir(store, store.getBlock('p1'))).toBe('auto');
  });

  it('falls back to the document root\'s dir when the block has none of its own', () => {
    const store = new EditorStore(makeDoc({ dir: 'rtl' }));
    expect(resolveBlockDir(store, store.getBlock('p1'))).toBe('rtl');
  });

  it('a block\'s own dir override takes precedence over the root\'s', () => {
    const store = new EditorStore(makeDoc({ dir: 'rtl' }, { dir: 'ltr' }));
    expect(resolveBlockDir(store, store.getBlock('p1'))).toBe('ltr');
  });

  it('returns "auto" for a null/undefined block', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveBlockDir(store, null)).toBe('auto');
    expect(resolveBlockDir(store, undefined)).toBe('auto');
  });

  it('resolving dir for the root block itself uses its own props.dir, not a self-referential fallback', () => {
    const store = new EditorStore(makeDoc({ dir: 'rtl' }));
    expect(resolveBlockDir(store, store.getBlock('root'))).toBe('rtl');
  });
});
