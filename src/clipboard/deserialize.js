import { APP_MIME } from './mimeType.js';
import { walkDomToBlocks, textToParagraphs } from './domWalk.js';
import { remapSubtreeIds } from './serialize.js';

/**
 * Given a DataTransfer-like object (real ClipboardEvent.clipboardData, or a
 * plain { types, getData } stand-in for tests), returns an array of
 * `{ block, runs, subtreeBlocks }` ready to insert. Prefers the lossless
 * same-editor payload, falls back to HTML (cross-editor), then plain text.
 */
export function deserializeClipboard(dataTransfer, registry, inlineRegistry) {
  const types = dataTransfer.types ?? [];

  if (types.includes(APP_MIME)) {
    const json = dataTransfer.getData(APP_MIME);
    if (json) return deserializeAppJSON(json);
  }

  if (types.includes('text/html')) {
    const html = dataTransfer.getData('text/html');
    if (html) return walkDomToBlocks(html, registry, inlineRegistry);
  }

  const text = dataTransfer.getData('text/plain') ?? '';
  return textToParagraphs(text);
}

function deserializeAppJSON(json) {
  const payload = JSON.parse(json);
  return payload.blocks.map((subtree) => remapSubtreeIds(subtree));
}
