import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useDocumentVersions } from '../../src/react/useDocumentVersions.js';
import { saveDocumentVersion } from '../../src/persistence/indexedDbPersistence.js';

function Harness({ docId }) {
  const { versions, isLoaded, refresh } = useDocumentVersions(docId);
  return (
    <div>
      <span data-testid="loaded">{String(isLoaded)}</span>
      <ul>
        {versions.map((v) => (
          <li key={v.id}>{v.label ?? v.id}</li>
        ))}
      </ul>
      <button onClick={refresh}>refresh</button>
    </div>
  );
}

const emptyDoc = { rootId: 'r', blocks: [], runs: [] };

describe('useDocumentVersions', () => {
  it('starts not loaded, then loads whatever is currently stored for docId', async () => {
    await saveDocumentVersion({
      id: 'uv-1',
      docId: 'doc-a',
      timestamp: 1,
      label: 'First Save',
      doc: emptyDoc,
    });

    render(<Harness docId="doc-a" />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.getByText('First Save')).not.toBeNull();
  });

  it('only shows versions for the given docId', async () => {
    await saveDocumentVersion({
      id: 'uv-mine',
      docId: 'doc-b',
      timestamp: 1,
      label: 'Mine',
      doc: emptyDoc,
    });
    await saveDocumentVersion({
      id: 'uv-other',
      docId: 'doc-other',
      timestamp: 1,
      label: 'Other',
      doc: emptyDoc,
    });

    render(<Harness docId="doc-b" />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.getByText('Mine')).not.toBeNull();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('refresh() re-queries storage for newly saved versions', async () => {
    render(<Harness docId="doc-c" />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.queryByText('Appeared Later')).toBeNull();

    await saveDocumentVersion({
      id: 'uv-later',
      docId: 'doc-c',
      timestamp: 1,
      label: 'Appeared Later',
      doc: emptyDoc,
    });
    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() => expect(screen.queryByText('Appeared Later')).not.toBeNull());
  });

  it('with no docId, reports loaded with an empty list', async () => {
    render(<Harness docId={null} />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
