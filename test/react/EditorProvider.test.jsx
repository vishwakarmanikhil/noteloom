import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider, useEditorStore } from '../../src/react/EditorProvider.jsx';
import { injectDefaultStyles } from '../../src/react/injectDefaultStyles.js';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

const STYLE_TAG_ID = 'noteloom-default-styles';

function makeStore() {
  return new EditorStore({ rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] });
}

function Probe() {
  useEditorStore(); // proves context is actually usable from inside children either way
  return <span data-testid="probe">hi</span>;
}

afterEach(() => {
  document.getElementById(STYLE_TAG_ID)?.remove();
});

describe('injectDefaultStyles', () => {
  it('inserts one <style> tag in <head> with the real theme content', () => {
    injectDefaultStyles();
    const tag = document.getElementById(STYLE_TAG_ID);
    expect(tag).not.toBeNull();
    expect(tag.tagName).toBe('STYLE');
    expect(tag.textContent).toContain('--noteloom-accent');
    expect(tag.textContent).toContain('.be-table-wrapper');
  });

  it('is idempotent — calling it again does not insert a second tag', () => {
    injectDefaultStyles();
    injectDefaultStyles();
    injectDefaultStyles();
    expect(document.querySelectorAll(`#${STYLE_TAG_ID}`)).toHaveLength(1);
  });
});

describe('EditorProvider: theme prop (auto-injects the default theme)', () => {
  it('injects the default theme on mount by default', () => {
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
    render(
      <EditorProvider store={makeStore()} registry={{}}>
        <Probe />
      </EditorProvider>,
    );
    expect(document.getElementById(STYLE_TAG_ID)).not.toBeNull();
  });

  it('theme="none" skips injection entirely', () => {
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
    render(
      <EditorProvider store={makeStore()} registry={{}} theme="none">
        <Probe />
      </EditorProvider>,
    );
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
  });
});

describe('EditorProvider: className/style (optional root wrapper)', () => {
  it('renders children with no extra wrapper element when neither prop is given', () => {
    const { container } = render(
      <EditorProvider store={makeStore()} registry={{}}>
        <Probe />
      </EditorProvider>,
    );
    // the probe's own <span> is the direct render output — no be-root div in between
    expect(container.querySelector('.be-root')).toBeNull();
    expect(container.firstChild.tagName).toBe('SPAN');
  });

  it('className wraps children in a be-root div carrying both classes', () => {
    const { container, getByTestId } = render(
      <EditorProvider store={makeStore()} registry={{}} className="my-editor">
        <Probe />
      </EditorProvider>,
    );
    const wrapper = container.querySelector('.be-root');
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains('my-editor')).toBe(true);
    expect(wrapper.contains(getByTestId('probe'))).toBe(true);
  });

  it('style wraps children in a be-root div with the given inline style, even without className', () => {
    const { container } = render(
      <EditorProvider store={makeStore()} registry={{}} style={{ '--noteloom-accent': '#16a34a' }}>
        <Probe />
      </EditorProvider>,
    );
    const wrapper = container.querySelector('.be-root');
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.getPropertyValue('--noteloom-accent')).toBe('#16a34a');
  });
});

describe('EditorProvider: getBlockClassName (internal per-block customization)', () => {
  function makeDocWithParagraph() {
    return new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    });
  }

  it('leaves the block\'s base class untouched when no callback is given', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = render(
      <EditorProvider store={makeDocWithParagraph()} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );
    const p = container.querySelector('[data-block-id="p1"]');
    expect(p.className).toBe('be-paragraph');
  });

  it('appends whatever getBlockClassName(block) returns, keyed off the real block object', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const getBlockClassName = (block) => (block.type === 'paragraph' ? `custom-${block.id}` : undefined);
    const { container } = render(
      <EditorProvider store={makeDocWithParagraph()} registry={registry} getBlockClassName={getBlockClassName}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );
    const p = container.querySelector('[data-block-id="p1"]');
    expect(p.className).toBe('be-paragraph custom-p1');
  });
});
