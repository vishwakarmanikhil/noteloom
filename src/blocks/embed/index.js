import { EmbedBlock } from './EmbedBlock.jsx';
import { genId } from '../../utils/idGen.js';
import { escapeAttr, escapeHTML } from '../../inline/marks.js';
import { insertSiblingAfter, insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { createEmbedBlock } from './createEmbedBlock.js';
import { updateRun } from '../../store/operations.js';

// Distinctive marker class for the 'file' kind's <a> — same reasoning as
// the button block: an ordinary pasted link must never be mistaken for a
// file embed.
const FILE_MARKER_CLASS = 'be-embed-file-link';

function toHTML(block) {
  const { kind, src, name } = block.props;
  if (!src) return '<p></p>'; // nothing embedded yet: nothing meaningful to export
  if (kind === 'image') return `<img src="${escapeAttr(src)}" alt="${escapeAttr(name || '')}">`;
  if (kind === 'video') return `<video src="${escapeAttr(src)}" controls></video>`;
  if (kind === 'audio') return `<audio src="${escapeAttr(src)}" controls></audio>`;
  return `<a class="${FILE_MARKER_CLASS}" href="${escapeAttr(src)}">${escapeHTML(name || src)}</a>`;
}

function toPlainText(block) {
  const { kind, src, name } = block.props;
  return src ? `[${kind}: ${name || src}]` : '';
}

function fromHTML(node) {
  if (node.tagName === 'IMG') {
    return blockOf('image', node.getAttribute('src') ?? '', node.getAttribute('alt') ?? '');
  }
  if (node.tagName === 'VIDEO') {
    return blockOf('video', node.getAttribute('src') ?? '', '');
  }
  if (node.tagName === 'AUDIO') {
    return blockOf('audio', node.getAttribute('src') ?? '', '');
  }
  if (node.tagName === 'A' && node.classList.contains(FILE_MARKER_CLASS)) {
    return blockOf('file', node.getAttribute('href') ?? '', node.textContent ?? '');
  }
  return null;
}

function blockOf(kind, src, name) {
  return { block: { id: genId(), type: 'embed', parentId: null, contentIds: [], props: { kind, src, name } }, runs: [] };
}

/** Same pattern as divider's slash command: an embed has no run of its own to focus into, so seed and focus a following paragraph. */
function insertEmbedCommand(kind) {
  return (store, { blockId, runId, sliceStart, sliceEnd }) => {
    const run = store.getRun(runId);
    const value = run?.value ?? '';
    store.applyOperation(updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }));
    const embedId = insertSiblingAfter(store, blockId, createEmbedBlock({ kind }));
    insertSiblingAfterAndFocus(store, embedId, createTextLeafBlock('paragraph'));
    return embedId;
  };
}

export const embedBlockType = {
  component: EmbedBlock,
  isLeaf: true, // contentIds always [] — a pure widget, same convention as divider
  defaultProps: { kind: 'file', src: '', name: '', mimeType: '' },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommands: ['image', 'video', 'audio', 'file'].map((kind) => ({
    label: kind.charAt(0).toUpperCase() + kind.slice(1),
    keywords: ['embed', 'upload', 'insert', kind],
    run: insertEmbedCommand(kind),
  })),
};
