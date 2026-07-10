import defaultThemeCSS from '../style.css?raw';

// Vite's `?raw` suffix resolves this at build time to the file's contents
// as a plain string — no CSS-loader/runtime dependency involved, so this
// stays true to "zero runtime dependencies" even though the theme itself
// is authored as a .css file. Both the ESM and CJS library builds embed
// the string directly; nothing is fetched or resolved at runtime.
const STYLE_TAG_ID = 'noteloom-default-styles';

/**
 * Inserts the default theme as a single <style> tag in <head>, once —
 * idempotent (checked by id) so mounting more than one <EditorProvider>,
 * or re-mounting one, never duplicates it. Called from EditorProvider's
 * own effect; see its `theme` prop to opt out entirely.
 */
export function injectDefaultStyles() {
  if (typeof document === 'undefined') return; // SSR guard — inject on the client only
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = defaultThemeCSS;
  document.head.appendChild(style);
}
