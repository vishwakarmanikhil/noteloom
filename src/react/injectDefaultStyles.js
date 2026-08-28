import defaultThemeCSS from '../style.css?raw';

// Vite's `?raw` suffix resolves this at build time to the file's contents
// as a plain string — no CSS-loader/runtime dependency involved, so this
// stays true to "zero runtime dependencies" even though the theme itself
// is authored as a .css file. Both the ESM and CJS library builds embed
// the string directly; nothing is fetched or resolved at runtime.
const STYLE_TAG_ID = 'noteloom-default-styles';

let warnedAboutAutoInject = false;

function warnOnceAboutAutoInjection() {
  if (warnedAboutAutoInject) return;
  warnedAboutAutoInject = true;
  // Dev-only signal. Suppressed under `production` and `test` so it doesn't
  // clutter build output or a consumer's test run.
  const env = typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : undefined;
  if (env === 'production' || env === 'test' || typeof console === 'undefined') return;
  console.warn(
    '[noteloom] The default theme is being auto-injected. A future major version will stop doing this — ' +
      'add `import \'noteloom/theme\'` to your app (recommended), or pass `theme="none"` to ' +
      '<NoteloomEditor> / <EditorProvider> if you already style the editor yourself. ' +
      'This message shows once, in development only.',
  );
}

/**
 * Inserts the default theme as a single <style> tag in <head>, once —
 * idempotent (checked by id) so mounting more than one <EditorProvider>,
 * or re-mounting one, never duplicates it. Called from EditorProvider's
 * own effect; see its `theme` prop to opt out entirely.
 *
 * `{ auto: true }` (what EditorProvider passes) also emits a one-time
 * dev-only deprecation notice — calling `injectDefaultStyles()` yourself, or
 * `import 'noteloom/theme'`, is the explicit path that will keep working.
 */
export function injectDefaultStyles({ auto = false } = {}) {
  if (typeof document === 'undefined') return; // SSR guard — inject on the client only
  if (document.getElementById(STYLE_TAG_ID)) return;
  if (auto) warnOnceAboutAutoInjection();
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = defaultThemeCSS;
  document.head.appendChild(style);
}
