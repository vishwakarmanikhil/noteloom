import { EmbedBlock } from './EmbedBlock.jsx';
import { defineBlock } from '../../registry/define.js';
import { genId } from '../../utils/idGen.js';
import { escapeAttr, escapeHTML } from '../../inline/marks.js';
import { insertSiblingAfter, insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { createEmbedBlock } from './createEmbedBlock.js';
import { updateRun } from '../../store/operations.js';
import { ImageIcon, VideoIcon, AudioIcon, PaperclipIcon, LinkIcon } from '../../react/icons.jsx';

const KIND_ICONS = {
  image: ImageIcon,
  video: VideoIcon,
  audio: AudioIcon,
  file: PaperclipIcon,
  oembed: LinkIcon,
};

// Distinctive marker class for the 'file' kind's <a> — same reasoning as
// the button block: an ordinary pasted link must never be mistaken for a
// file embed.
const FILE_MARKER_CLASS = 'be-embed-file-link';

// Same idea for 'oembed' (YouTube/Vimeo/Loom/Figma/CodePen/Spotify, see
// oembedProviders.js) — the exported <a> stands in for the iframe (which
// doesn't round-trip meaningfully through plain HTML clipboard/export), so
// it needs its own marker to be recognized coming back in via fromHTML.
const OEMBED_MARKER_CLASS = 'be-embed-oembed-link';

// Only image/video kinds ever carry a non-default align/width (see
// EmbedBlock's resize handle/alignment toolbar) — the inline `style`
// attribute is only ever emitted for those, and only when it actually
// differs from the default, so a plain default-aligned embed's HTML output
// is byte-identical to before this existed.
function alignWidthStyle(kind, align, width) {
  if (kind !== 'image' && kind !== 'video' && kind !== 'oembed') return '';
  const declarations = [];
  if (width !== 100) declarations.push(`width:${width}%`);
  if (align === 'center')
    declarations.push('display:block', 'margin-left:auto', 'margin-right:auto');
  else if (align === 'right') declarations.push('display:block', 'margin-left:auto');
  return declarations.length ? ` style="${declarations.join(';')}"` : '';
}

function parseAlignWidth(node) {
  const styleWidth = node.style?.width;
  const width = styleWidth && styleWidth.endsWith('%') ? parseInt(styleWidth, 10) : 100;
  let align = 'left';
  if (node.style?.marginLeft === 'auto' && node.style?.marginRight === 'auto') align = 'center';
  else if (node.style?.marginLeft === 'auto') align = 'right';
  return { align, width: Number.isFinite(width) ? width : 100 };
}

function toHTML(block) {
  const {
    kind,
    src,
    name,
    alt = '',
    align = 'left',
    width = 100,
    provider = '',
    originalUrl = '',
  } = block.props;
  if (!src) return '<p></p>'; // nothing embedded yet: nothing meaningful to export
  const style = alignWidthStyle(kind, align, width);
  // Deliberately `alt`, never `name` (the uploaded file's raw filename) —
  // same "don't silently present a filename as if it were real alt text"
  // rationale as EmbedBlock.jsx's own EmbedPreview.
  if (kind === 'image') return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${style}>`;
  if (kind === 'video') return `<video src="${escapeAttr(src)}" controls${style}></video>`;
  if (kind === 'audio') return `<audio src="${escapeAttr(src)}" controls></audio>`;
  if (kind === 'oembed') {
    // An <a>, not the <iframe> itself — a raw iframe doesn't paste
    // meaningfully into most other HTML consumers, and a plain link that
    // still round-trips back into THIS editor (via the marker class,
    // fromHTML below) is more useful than a broken third-party embed. Full
    // in-app copy/paste (APP_MIME) carries the real block/props and never
    // goes through this path at all.
    return `<a class="${OEMBED_MARKER_CLASS}" href="${escapeAttr(originalUrl || src)}" data-embed-url="${escapeAttr(src)}" data-embed-provider="${escapeAttr(provider)}">${escapeHTML(originalUrl || src)}</a>`;
  }
  return `<a class="${FILE_MARKER_CLASS}" href="${escapeAttr(src)}">${escapeHTML(name || src)}</a>`;
}

function toPlainText(block) {
  const { kind, src, name, originalUrl = '' } = block.props;
  if (!src) return '';
  if (kind === 'oembed') return `[embed: ${originalUrl || src}]`;
  return `[${kind}: ${name || src}]`;
}

function toMarkdown(block) {
  const { kind, src, name, alt = '', originalUrl = '' } = block.props;
  if (!src) return '';
  if (kind === 'image') return `![${alt}](${src})`;
  if (kind === 'oembed') return `[${originalUrl || src}](${originalUrl || src})`;
  return `[${name || src}](${src})`; // video/audio/file: Markdown has no native player syntax, a link is the honest fallback
}

function fromHTML(node) {
  if (node.tagName === 'IMG') {
    // A pasted <img>'s own alt attribute is real alt text (however good or
    // bad it is at the source) — carried into props.alt, kept separate
    // from `name` (which has no meaningful value here; there's no "raw
    // filename" for an externally pasted image the way there is for a
    // locally uploaded file).
    return blockOf('image', node.getAttribute('src') ?? '', '', {
      ...parseAlignWidth(node),
      alt: node.getAttribute('alt') ?? '',
    });
  }
  if (node.tagName === 'VIDEO') {
    return blockOf('video', node.getAttribute('src') ?? '', '', parseAlignWidth(node));
  }
  if (node.tagName === 'AUDIO') {
    return blockOf('audio', node.getAttribute('src') ?? '', '');
  }
  if (node.tagName === 'A' && node.classList.contains(OEMBED_MARKER_CLASS)) {
    return blockOf('oembed', node.getAttribute('data-embed-url') ?? '', '', {
      ...parseAlignWidth(node),
      provider: node.getAttribute('data-embed-provider') ?? '',
      originalUrl: node.getAttribute('href') ?? '',
    });
  }
  if (node.tagName === 'A' && node.classList.contains(FILE_MARKER_CLASS)) {
    return blockOf('file', node.getAttribute('href') ?? '', node.textContent ?? '');
  }
  return null;
}

function blockOf(
  kind,
  src,
  name,
  { align = 'left', width = 100, alt = '', provider = '', originalUrl = '' } = {},
) {
  return {
    block: {
      id: genId(),
      type: 'embed',
      parentId: null,
      contentIds: [],
      props: { kind, src, name, alt, align, width, provider, originalUrl },
    },
    runs: [],
  };
}

/** Same pattern as divider's slash command: an embed has no run of its own to focus into, so seed and focus a following paragraph. */
function insertEmbedCommand(kind) {
  return (store, { blockId, runId, sliceStart, sliceEnd }) => {
    const run = store.getRun(runId);
    const value = run?.value ?? '';
    store.applyOperation(
      updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }),
    );
    const embedId = insertSiblingAfter(store, blockId, createEmbedBlock({ kind }));
    insertSiblingAfterAndFocus(store, embedId, createTextLeafBlock('paragraph'));
    return embedId;
  };
}

export const embedBlockType = defineBlock({
  name: 'embed',
  contentModel: 'void',
  component: EmbedBlock,
  defaultProps: {
    kind: 'file',
    src: '',
    name: '',
    alt: '',
    mimeType: '',
    align: 'left',
    width: 100,
    provider: '',
    originalUrl: '',
  },
  toHTML,
  toPlainText,
  toMarkdown,
  fromHTML,
  slashCommands: [
    ...['image', 'video', 'audio', 'file'].map((kind) => ({
      label: kind.charAt(0).toUpperCase() + kind.slice(1),
      icon: KIND_ICONS[kind],
      keywords: ['embed', 'upload', 'insert', kind],
      run: insertEmbedCommand(kind),
    })),
    {
      label: 'Embed link',
      icon: KIND_ICONS.oembed,
      // A YouTube/Vimeo/Loom/Figma/CodePen/Spotify link pasted into an
      // image/video/file block's own URL field is also auto-detected (see
      // EmbedBlock.jsx's commitUrl) — this command just gets there in one
      // step instead of via "/video" first.
      keywords: ['embed', 'link', 'youtube', 'vimeo', 'loom', 'figma', 'codepen', 'spotify'],
      run: insertEmbedCommand('oembed'),
    },
  ],
});
