import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, useBlockRegistry, useInlineRegistry } from './EditorProvider.jsx';
import { useDocumentVersions } from './useDocumentVersions.js';
import { createAutoVersionHistory } from '../versions/autoVersionHistory.js';
import { diffDocumentsHTML } from '../versions/diffVersions.js';
import { applyDocumentTemplate } from '../templates/blockTemplates.js';
import { exportDocumentHTML } from '../clipboard/exportDocument.js';
import { EditorStore } from '../store/EditorStore.js';
import { CommentAvatar } from './CommentAvatar.jsx';
import { formatRelativeTime } from './commentFormatting.js';
import { ClockHistoryIcon, RestoreIcon, XIcon } from './icons.jsx';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function formatDayLabel(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Google Docs-style version history — no "name it and save" step. Mount
 * this once anywhere under an `<EditorProvider>` (`store` must be a
 * `History` instance, not a plain `EditorStore` — see `createAutoVersionHistory`)
 * and it both quietly captures automatic snapshots (one saved after each
 * burst of edits settles, attributed to whoever made them via History's
 * `defaultActorId`/`useEditor`'s `currentUserId`, no separate identity
 * plumbing needed here) AND renders the "Version history" button + drawer
 * UI for browsing/previewing/restoring them.
 *
 * The drawer's preview is a static HTML render (`exportDocumentHTML` against
 * a throwaway `EditorStore` built from that version's snapshot) — read-only
 * by construction, not a second live nested editor.
 */
export function VersionHistory({ docId, idleMs, maxVersions }) {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();
  const { versions, isLoaded, refresh } = useDocumentVersions(docId);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('changes'); // 'changes' | 'preview'
  const drawerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (typeof store.getHistoryLog !== 'function') return undefined; // needs a History instance, not a plain EditorStore
    const autoHistory = createAutoVersionHistory({
      store,
      docId,
      idleMs,
      maxVersions,
      onSnapshot: refresh,
    });
    return () => autoHistory.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, docId]);

  function close() {
    setIsOpen(false);
    setSelectedId(null);
    setViewMode('changes');
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Same one-time move-in-on-open / move-back-out-on-close as Modal.jsx —
  // this drawer is hand-rolled rather than built on Modal (it's a
  // side-drawer, not a centered dialog), so it needs its own copy of the
  // same focus handling instead of inheriting it for free.
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement;
      const drawer = drawerRef.current;
      const focusable = drawer?.querySelector(FOCUSABLE_SELECTOR);
      (focusable ?? drawer)?.focus();
      return undefined;
    }
    previouslyFocusedRef.current?.focus?.();
    previouslyFocusedRef.current = null;
    return undefined;
  }, [isOpen]);

  const selectedIndex = versions.findIndex((v) => v.id === selectedId);
  const selected = selectedIndex >= 0 ? versions[selectedIndex] : null;
  // versions is newest-first, so the version right before this one chronologically is the next array entry.
  const previousVersion = selectedIndex >= 0 ? (versions[selectedIndex + 1] ?? null) : null;

  const previewHtml = useMemo(() => {
    if (!selected) return '';
    const previewStore = new EditorStore(selected.doc);
    return exportDocumentHTML(previewStore, registry, inlineRegistry);
  }, [selected, registry, inlineRegistry]);

  const diffHtml = useMemo(() => {
    if (!selected) return '';
    return diffDocumentsHTML(previousVersion?.doc ?? null, selected.doc);
  }, [selected, previousVersion]);

  function handleRestore() {
    if (!selected) return;
    if (!window.confirm('Restore this version? This replaces the current document.')) return;
    applyDocumentTemplate(store, selected.doc);
    close();
  }

  // Groups by day, preserving useDocumentVersions' own newest-first order.
  const groups = [];
  for (const version of versions) {
    const label = formatDayLabel(version.timestamp);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, versions: [] };
      groups.push(group);
    }
    group.versions.push(version);
  }

  return (
    <>
      <button
        type="button"
        className="be-version-history-trigger"
        onClick={() => setIsOpen(true)}
        title="Version history"
      >
        <ClockHistoryIcon size={15} />
        Version history
      </button>
      {isOpen &&
        createPortal(
          <>
            <div className="be-version-history-backdrop" onClick={close} />
            <div
              ref={drawerRef}
              className="be-version-history-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Version history"
              tabIndex={-1}
            >
              <div className="be-version-history-header">
                <span>{selected ? 'Preview' : 'Version history'}</span>
                <button
                  type="button"
                  className="be-version-history-close"
                  onClick={close}
                  aria-label="Close"
                >
                  <XIcon size={14} />
                </button>
              </div>

              {selected ? (
                <div className="be-version-history-preview">
                  <div className="be-version-history-preview-meta">
                    <CommentAvatar authorId={selected.authorId} size={24} />
                    <div>
                      <div className="be-version-history-preview-author">
                        {selected.authorId ?? 'Unknown'}
                      </div>
                      <div className="be-version-history-preview-time">
                        {new Date(selected.timestamp).toLocaleString()} · {selected.summary}
                      </div>
                    </div>
                  </div>

                  <div
                    className="be-version-history-view-toggle"
                    role="tablist"
                    aria-label="View mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === 'changes'}
                      className={viewMode === 'changes' ? 'is-active' : ''}
                      onClick={() => setViewMode('changes')}
                    >
                      Changes
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === 'preview'}
                      className={viewMode === 'preview' ? 'is-active' : ''}
                      onClick={() => setViewMode('preview')}
                    >
                      Preview
                    </button>
                  </div>

                  {viewMode === 'changes' && (
                    <>
                      <div className="be-version-history-diff-legend">
                        <span className="be-version-diff-added">Added</span>
                        <span className="be-version-diff-removed">Removed</span>
                        {!previousVersion && (
                          <span className="be-version-history-diff-legend-note">
                            First saved version — everything shown is new.
                          </span>
                        )}
                      </div>
                      {/* Word-level diff against the previous version, rendered from plain text -- deliberately simpler than the live editor's own formatting (see diffDocumentsHTML). */}
                      <div
                        className="be-version-history-preview-body be-version-history-diff-body"
                        dangerouslySetInnerHTML={{ __html: diffHtml }}
                      />
                    </>
                  )}
                  {viewMode === 'preview' && (
                    // Static HTML from a throwaway store (see previewHtml above) -- inherently read-only, not a second live editor.
                    <div
                      className="be-version-history-preview-body"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )}

                  <div className="be-version-history-preview-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setViewMode('changes');
                      }}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="be-version-history-restore"
                      onClick={handleRestore}
                    >
                      <RestoreIcon size={13} />
                      Restore this version
                    </button>
                  </div>
                </div>
              ) : (
                <div className="be-version-history-list">
                  {!isLoaded && <p className="be-version-history-empty">Loading…</p>}
                  {isLoaded && versions.length === 0 && (
                    <p className="be-version-history-empty">
                      No versions yet — one is saved automatically after you make some edits and
                      pause.
                    </p>
                  )}
                  {groups.map((group) => (
                    <div key={group.label} className="be-version-history-group">
                      <div className="be-version-history-group-label">{group.label}</div>
                      {group.versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          className="be-version-history-item"
                          onClick={() => setSelectedId(version.id)}
                        >
                          <CommentAvatar authorId={version.authorId} size={24} />
                          <div className="be-version-history-item-body">
                            <div className="be-version-history-item-author">
                              {version.authorId ?? 'Unknown'}
                            </div>
                            <div className="be-version-history-item-meta">
                              {formatRelativeTime(version.timestamp)} · {version.summary}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
