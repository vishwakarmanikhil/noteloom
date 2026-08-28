import { useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useEditorStore, useBlockRegistry, useInlineRegistry } from './EditorProvider.jsx';
import { resolveRunSelection, resolveCollapsedCaret } from './selectionResolve.js';
import { setCaretSync } from './focusRun.js';

/**
 * Runs the behavior half of `defineExtension()` results — `keymap`,
 * `onBeforeInput`, `onPaste`, `setup` — for the extensions passed to
 * `useEditor({ extensions })`. `<NoteloomEditor>` calls this from its editor
 * surface (which owns `containerRef`); it must be called BEFORE
 * `useEditorKeyboardShortcuts` so an extension keymap gets first crack at a
 * key and can claim it (`event.stopImmediatePropagation()` then prevents the
 * built-in handler on the same element from also running).
 *
 * Entirely inert when `extensions` carries nothing with a behavior field —
 * `useEditor()` with no `extensions` adds zero listeners here.
 *
 * The `ctx` facade passed to every handler (stable for the life of the editor):
 *   store, registry, inlineRegistry            — the same objects useEditor made
 *   container                                  — the editor's root element (getter)
 *   getBlock(id) / getRun(id) / getRootId()
 *   applyOperation(op) / applyOperations(ops)   — wrapped in flushSync so the DOM
 *                                                is in sync before you setCaret()
 *   getSelection() / getCaret()                 — resolveRunSelection / resolveCollapsedCaret
 *   setCaret(runId, offset)
 *   subscribe(fn)                               — store.subscribeAll
 */
export function useExtensionBehaviors(extensions, containerRef) {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();

  const behaviorExtensions = useMemo(
    () =>
      (extensions ?? []).filter(
        (ext) => ext && (ext.keymap || ext.onBeforeInput || ext.onPaste || ext.setup),
      ),
    [extensions],
  );

  const ctx = useMemo(
    () => ({
      store,
      registry,
      inlineRegistry,
      get container() {
        return containerRef.current;
      },
      getBlock: (id) => store.getBlock(id),
      getRun: (id) => store.getRun(id),
      getRootId: () => store.getRootId(),
      applyOperation: (op) => flushSync(() => store.applyOperation(op)),
      applyOperations: (ops) =>
        flushSync(() => {
          if (typeof store.performBatch === 'function') store.performBatch(ops);
          else for (const op of ops) store.applyOperation(op);
        }),
      getSelection: () => resolveRunSelection(),
      getCaret: () => resolveCollapsedCaret(),
      setCaret: (runId, offset) => setCaretSync(runId, offset),
      subscribe: (fn) => store.subscribeAll(fn),
    }),
    [store, registry, inlineRegistry, containerRef],
  );

  // keymap / onBeforeInput / onPaste — native listeners on the surface.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || behaviorExtensions.length === 0) return undefined;

    const withKeymap = behaviorExtensions.filter((ext) => ext.keymap);
    const withBeforeInput = behaviorExtensions.filter((ext) => ext.onBeforeInput);
    const withPaste = behaviorExtensions.filter((ext) => ext.onPaste);

    const onKeyDown = (event) => {
      for (const ext of withKeymap) {
        for (const [spec, handler] of Object.entries(ext.keymap)) {
          if (matchesKeymap(event, spec) && handler(ctx, event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }
      }
    };
    const onBeforeInput = (event) => {
      for (const ext of withBeforeInput) {
        if (ext.onBeforeInput(ctx, event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    };
    const onPaste = (event) => {
      for (const ext of withPaste) {
        if (ext.onPaste(ctx, event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    };

    if (withKeymap.length) container.addEventListener('keydown', onKeyDown);
    if (withBeforeInput.length) container.addEventListener('beforeinput', onBeforeInput);
    if (withPaste.length) container.addEventListener('paste', onPaste);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('beforeinput', onBeforeInput);
      container.removeEventListener('paste', onPaste);
    };
  }, [behaviorExtensions, containerRef, ctx]);

  // setup(ctx) — run once per extension, collect cleanups.
  useEffect(() => {
    const cleanups = behaviorExtensions
      .filter((ext) => ext.setup)
      .map((ext) => ext.setup(ctx))
      .filter((fn) => typeof fn === 'function');
    return () => {
      for (const fn of cleanups) fn();
    };
  }, [behaviorExtensions, ctx]);
}

/**
 * Matches a keydown against a spec like `Mod-Shift-k` / `Enter` / `Tab`.
 * `Mod` = Ctrl on Windows/Linux, Cmd on Mac (either metaKey or ctrlKey).
 */
export function matchesKeymap(event, spec) {
  const parts = String(spec).split('-');
  const key = parts.pop().toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));

  const hasMod = event.metaKey || event.ctrlKey;
  if (mods.has('mod') !== hasMod) return false;
  if (mods.has('shift') !== event.shiftKey) return false;
  if (mods.has('alt') !== event.altKey) return false;

  return event.key.toLowerCase() === key;
}
