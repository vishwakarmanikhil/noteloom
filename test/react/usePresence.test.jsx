import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { usePresence } from '../../src/react/usePresence.js';

function makeFakeSession(initial = new Map()) {
  let presence = initial;
  const listeners = new Set();
  return {
    getPresence: () => presence,
    onPresenceChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    // test-only helper
    _emit(next) {
      presence = next;
      for (const cb of listeners) cb(next);
    },
  };
}

function Harness({ session }) {
  const presence = usePresence(session);
  return <div data-testid="entries">{[...presence.entries()].map(([id, data]) => `${id}:${data.offset}`).join(',')}</div>;
}

describe('usePresence', () => {
  it('returns an empty map when no session is provided', () => {
    const { getByTestId } = render(<Harness session={null} />);
    expect(getByTestId('entries').textContent).toBe('');
  });

  it('returns the session\'s current presence immediately on mount', () => {
    const session = makeFakeSession(new Map([['peer-a', { offset: 1 }]]));
    const { getByTestId } = render(<Harness session={session} />);
    expect(getByTestId('entries').textContent).toBe('peer-a:1');
  });

  it('re-renders when the session reports a presence change', () => {
    const session = makeFakeSession();
    const { getByTestId } = render(<Harness session={session} />);
    expect(getByTestId('entries').textContent).toBe('');

    act(() => {
      session._emit(new Map([['peer-a', { offset: 5 }]]));
    });
    expect(getByTestId('entries').textContent).toBe('peer-a:5');

    act(() => {
      session._emit(new Map([['peer-a', { offset: 5 }], ['peer-b', { offset: 9 }]]));
    });
    expect(getByTestId('entries').textContent).toBe('peer-a:5,peer-b:9');
  });

  it('unsubscribes from the old session and resubscribes when the session prop changes', () => {
    const sessionOne = makeFakeSession(new Map([['peer-a', { offset: 1 }]]));
    const sessionTwo = makeFakeSession(new Map([['peer-z', { offset: 99 }]]));
    const { getByTestId, rerender } = render(<Harness session={sessionOne} />);
    expect(getByTestId('entries').textContent).toBe('peer-a:1');

    rerender(<Harness session={sessionTwo} />);
    expect(getByTestId('entries').textContent).toBe('peer-z:99');

    // a change on the OLD session must no longer affect this component
    act(() => {
      sessionOne._emit(new Map([['peer-a', { offset: 2 }]]));
    });
    expect(getByTestId('entries').textContent).toBe('peer-z:99');
  });
});
