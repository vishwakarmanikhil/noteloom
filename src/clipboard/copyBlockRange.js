import { serializeBlockRange } from './serialize.js';

/**
 * Writes a block range to the system clipboard via the async
 * `navigator.clipboard` API — used by BlockRangeActionMenu's Copy/Cut
 * buttons, which aren't a native `copy`/`cut` ClipboardEvent (those go
 * through useClipboardHandlers' synchronous, `event.clipboardData` path
 * instead, which is the only one that can carry the app's own lossless
 * MIME type — see serialize.js's own doc comment on that risk). The async
 * API's `ClipboardItem` support for arbitrary MIME types is inconsistent
 * across browsers, so this deliberately only ever writes `text/plain` and
 * `text/html` — a paste elsewhere (or back into this editor) still works
 * via the same text/html -> domWalk fallback path an external app's copy
 * would use, just without the same-editor lossless round-trip.
 */
export async function copyBlockRangeToClipboard(store, registry, inlineRegistry, blockIds) {
  const { html, text } = serializeBlockRange(store, registry, blockIds, inlineRegistry);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return;
  }
  await navigator.clipboard?.writeText?.(text);
}
