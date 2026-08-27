import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useTemplates } from '../../src/react/useTemplates.js';
import { saveTemplate } from '../../src/persistence/indexedDbPersistence.js';

function Harness({ scope }) {
  const { templates, isLoaded, refresh } = useTemplates({ scope });
  return (
    <div>
      <span data-testid="loaded">{String(isLoaded)}</span>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
      <button onClick={refresh}>refresh</button>
    </div>
  );
}

describe('useTemplates', () => {
  it('starts not loaded, then loads whatever is currently stored', async () => {
    await saveTemplate({
      id: 'ut-1',
      scope: 'document',
      name: 'Doc One',
      doc: { rootId: 'r', blocks: [], runs: [] },
    });

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.getByText('Doc One')).not.toBeNull();
  });

  it('filters by scope when given', async () => {
    await saveTemplate({
      id: 'ut-doc',
      scope: 'document',
      name: 'A Document',
      doc: { rootId: 'r', blocks: [], runs: [] },
    });
    await saveTemplate({ id: 'ut-block', scope: 'block', name: 'A Snippet', doc: { roots: [] } });

    render(<Harness scope="block" />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.getByText('A Snippet')).not.toBeNull();
    expect(screen.queryByText('A Document')).toBeNull();
  });

  it('refresh() re-queries storage for newly saved templates', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));
    expect(screen.queryByText('Appeared Later')).toBeNull();

    await saveTemplate({
      id: 'ut-later',
      scope: 'document',
      name: 'Appeared Later',
      doc: { rootId: 'r', blocks: [], runs: [] },
    });
    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() => expect(screen.queryByText('Appeared Later')).not.toBeNull());
  });
});
