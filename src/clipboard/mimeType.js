// Custom clipboard MIME type for lossless same-editor copy/paste round-trips.
// Reliable via the synchronous ClipboardEvent path used in useClipboardHandlers;
// NOT guaranteed via the async navigator.clipboard.write/ClipboardItem API —
// if a toolbar "Copy" button is added later, restrict it to text/plain+text/html.
export const APP_MIME = 'application/x-block-editor-blocks+json';
