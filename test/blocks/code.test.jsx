import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';
import { serializeBlockRange } from '../../src/clipboard/serialize.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'c1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      {
        id: 'c1',
        type: 'code',
        parentId: 'root',
        contentIds: ['r-c1'],
        props: { language: 'javascript' },
      },
    ],
    runs: [
      { id: 'r-p1', type: 'text', value: 'before', marks: {} },
      { id: 'r-c1', type: 'text', value: 'const x = 1;', marks: {} },
    ],
  };
}

function renderDoc(store, providerProps = {}) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry} {...providerProps}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

function placeCollapsedCaret(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('code block: renders as a leaf inside <pre><code>, with a language selector', () => {
  it('renders the code text and the language dropdown reflecting props.language', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const block = container.querySelector('[data-block-id="c1"]');
    expect(block.querySelector('pre')).not.toBeNull();
    expect(block.querySelector('code')).not.toBeNull();
    expect(block.textContent).toContain('const x = 1;');
    expect(block.querySelector('.be-code-block-language .be-select-value').textContent).toBe(
      'javascript',
    );
  });

  it('changing the language dropdown updates props.language', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const trigger = container.querySelector(
      '[data-block-id="c1"] .be-code-block-language .be-select-trigger',
    );
    fireEvent.click(trigger);
    const option = [...document.querySelectorAll('.be-select-option')].find(
      (el) => el.textContent === 'python',
    );
    fireEvent.mouseDown(option);

    expect(store.getBlock('c1').props.language).toBe('python');
  });

  it('shows the empty-code placeholder only while empty and focused', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderDoc(store);
    const codeEl = container.querySelector('[data-block-id="c1"] code');

    expect(codeEl.getAttribute('data-empty')).toBe('');
    expect(codeEl.getAttribute('data-placeholder')).toBe('Empty code block');
  });
});

describe('code block: Enter inserts a literal newline instead of splitting into a new block', () => {
  it('pressing Enter inside the code keeps it one block, with "\\n" spliced into the run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    placeCollapsedCaret(runNode, 5); // "const|_x = 1;"
    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'c1']); // still just one code block
    expect(store.getRun('r-c1').value).toBe('const\n x = 1;');
  });

  it('a run ending in "\\n" gets a trailing zero-width anchor character in the DOM, disambiguating the browser\'s native trailing-newline caret position', () => {
    // Regression: a text node whose very last character is "\n" inside a
    // white-space: pre/pre-wrap element has an ambiguous trailing caret
    // position in every major browser -- typing right after it frequently
    // inserts the new character BEFORE the "\n" instead of after it
    // (swapping the newline and the just-typed text), which is what "press
    // Enter in a code block, then type" looked like from the outside: text
    // landing next to the visible content instead of at the caret, with
    // the real (invisible) caret several lines away from where it visually
    // appeared. jsdom doesn't simulate native contentEditable typing well
    // enough to reproduce the browser bug itself, but this asserts the
    // actual fix's mechanism: the host span's raw DOM text carries one
    // more real (zero-width) character right after the "\n" for the
    // browser to anchor "end of text" to -- see displayValueFor in
    // EditableBlockContent.jsx.
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'const x = 1;\n', marks: {} }],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    expect(runNode.textContent).toBe('const x = 1;\n​');
    expect(runNode.textContent.replace(/​/g, '')).toBe('const x = 1;\n');
  });

  it('a run NOT ending in "\\n" carries no anchor character (only the "\\n" case needs it)', () => {
    const store = new EditorStore(makeDoc()); // r-c1: 'const x = 1;'
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    expect(runNode.textContent).toBe('const x = 1;');
  });
});

describe('code block: Tab inserts literal spaces instead of navigating away', () => {
  it('pressing Tab inserts two spaces at the caret', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    placeCollapsedCaret(runNode, 0);
    fireEvent.keyDown(runNode, { key: 'Tab' });

    expect(store.getRun('r-c1').value).toBe('  const x = 1;');
  });
});

describe('code block: Backspace-at-start (safe, non-mergeable — matches table/listItem precedent)', () => {
  it('an empty code block is removed outright, landing focus on the previous block', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'c1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r-c1'], props: {} },
      ],
      runs: [
        { id: 'r-p1', type: 'text', value: 'before', marks: {} },
        { id: 'r-c1', type: 'text', value: '', marks: {} },
      ],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'c1');
    expect(focusId).toBe('p1');
    expect(store.getBlock('root').contentIds).toEqual(['p1']);
    expect(store.getBlock('c1')).toBeUndefined();
  });

  it('a non-empty code block does NOT merge into a preceding paragraph (code is not a mergeable text type)', () => {
    const store = new EditorStore(makeDoc());
    const result = mergeWithPreviousOrDelete(store, 'c1');

    expect(result).toBeNull(); // safe no-op, matches table/listItem
    expect(store.getBlock('c1')).toBeDefined();
    expect(store.getRun('r-c1').value).toBe('const x = 1;');
  });
});

describe('code block: clipboard round-trip', () => {
  it('toHTML wraps the code in <pre><code data-language="...">', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('code').toHTML(store.getBlock('c1'), { store, registry });
    expect(html).toBe('<pre><code data-language="javascript">const x = 1;</code></pre>');
  });

  it('omits data-language for the default "plaintext"', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        {
          id: 'c1',
          type: 'code',
          parentId: 'root',
          contentIds: ['r1'],
          props: { language: 'plaintext' },
        },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'plain', marks: {} }],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('code').toHTML(store.getBlock('c1'), { store, registry });
    expect(html).toBe('<pre><code>plain</code></pre>');
  });

  it('escapes HTML-significant characters in code content', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'if (a < b) { return; }', marks: {} }],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('code').toHTML(store.getBlock('c1'), { store, registry });
    expect(html).toContain('a &lt; b');
  });

  it('same-editor serializeBlockRange round-trips language and multi-line content losslessly', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        {
          id: 'c1',
          type: 'code',
          parentId: 'root',
          contentIds: ['r1'],
          props: { language: 'python' },
        },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'def f():\n    pass', marks: {} }],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { json } = serializeBlockRange(store, registry, ['c1']);
    const parsed = JSON.parse(json).blocks[0];
    expect(parsed.blocks[0].props.language).toBe('python');
    expect(parsed.runs[0].value).toBe('def f():\n    pass');
  });

  it('walkDomToBlocks parses an external <pre><code> into one code block, preserving embedded newlines', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks(
      '<pre><code data-language="javascript">line one\nline two</code></pre>',
      registry,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('code');
    expect(inserts[0].block.props.language).toBe('javascript');
    expect(inserts[0].runs[0].value).toBe('line one\nline two');
  });

  it('walkDomToBlocks handles a <pre> with no language attribute', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks('<pre><code>plain text</code></pre>', registry);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.props.language).toBeUndefined();
    expect(inserts[0].runs[0].value).toBe('plain text');
  });

  it('walkDomToBlocks finds a <pre> wrapped inside container elements (real "copy code" clipboard HTML from VS Code/GitHub/doc sites) instead of falling back to one squished, unformatted paragraph', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks(
      '<div class="highlight"><div><pre><code>line one\nline two</code></pre></div></div>',
      registry,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('code');
    expect(inserts[0].runs[0].value).toBe('line one\nline two');
  });

  it('walkDomToBlocks + code fromHTML reconstruct line breaks from a <pre> built out of one <div> per line (no literal "\\n" characters at all) instead of squishing every line together', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks(
      '<pre><code><div>function greet(name) {</div><div>  return name;</div><div>}</div></code></pre>',
      registry,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('code');
    expect(inserts[0].runs[0].value).toBe('function greet(name) {\n  return name;\n}');
  });

  it('walkDomToBlocks + code fromHTML treat a <br> the same way as a line-per-<div> source', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks(
      '<pre><code>line one<br>line two<br>line three</code></pre>',
      registry,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].runs[0].value).toBe('line one\nline two\nline three');
  });
});

describe("code block: syntax-highlight overlay (EditorProvider's highlightCode prop)", () => {
  it('without highlightCode configured, renders plain text with no overlay', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const pre = container.querySelector('[data-block-id="c1"] pre');
    expect(pre.classList.contains('be-code-block-highlighted')).toBe(false);
    expect(pre.querySelector('.be-code-block-highlight')).toBeNull();
  });

  it('with highlightCode configured, renders its HTML in an aria-hidden overlay fed the current code and language', () => {
    const store = new EditorStore(makeDoc());
    const highlightCode = (code, language) =>
      `<span class="tok" data-lang="${language}">${code}</span>`;
    const { container } = renderDoc(store, { highlightCode });

    const pre = container.querySelector('[data-block-id="c1"] pre');
    expect(pre.classList.contains('be-code-block-highlighted')).toBe(true);
    const overlay = pre.querySelector('.be-code-block-highlight');
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.querySelector('.tok').getAttribute('data-lang')).toBe('javascript');
    expect(overlay.textContent).toBe('const x = 1;');
  });

  it("the overlay is NOT a <code> element (regression: .be-code-block-pre code { position: relative } would otherwise beat .be-code-block-highlight's position: absolute by CSS specificity, pulling the overlay back into normal document flow and rendering it as a second, stacked copy of the code, pushed above the real editable text instead of layered behind it)", () => {
    const store = new EditorStore(makeDoc());
    const highlightCode = (code) => code;
    const { container } = renderDoc(store, { highlightCode });

    const overlay = container.querySelector('[data-block-id="c1"] .be-code-block-highlight');
    expect(overlay.tagName).not.toBe('CODE');
  });

  it('the overlay stays in sync as the code text changes (Enter splicing a literal newline)', () => {
    const store = new EditorStore(makeDoc());
    const highlightCode = (code) => code;
    const { container } = renderDoc(store, { highlightCode });
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    placeCollapsedCaret(runNode, 5);
    fireEvent.keyDown(runNode, { key: 'Enter' });

    const overlay = container.querySelector('[data-block-id="c1"] .be-code-block-highlight');
    expect(overlay.textContent).toBe('const\n x = 1;');
  });
});

describe('code block: undo/redo through the same store operations as everything else', () => {
  it('undo restores the pre-Enter single-line value', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    placeCollapsedCaret(runNode, 5);
    fireEvent.keyDown(runNode, { key: 'Enter' });
    expect(store.getRun('r-c1').value).toBe('const\n x = 1;');

    act(() => store.undo());
    expect(store.getRun('r-c1').value).toBe('const x = 1;');
  });
});
