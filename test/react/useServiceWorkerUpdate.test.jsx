import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useServiceWorkerUpdate } from '../../src/react/useServiceWorkerUpdate.js';

class FakeWaitingWorker {
  constructor() {
    this.postMessage = vi.fn();
  }
}

class FakeRegistration {
  constructor() {
    this.waiting = null;
    this.installing = null;
    this._listeners = {};
  }

  addEventListener(type, cb) {
    (this._listeners[type] ??= []).push(cb);
  }

  emit(type) {
    for (const cb of this._listeners[type] ?? []) cb();
  }
}

function Harness() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  return (
    <div>
      <span data-testid="status">{updateAvailable ? 'available' : 'none'}</span>
      <button type="button" onClick={applyUpdate}>
        update
      </button>
    </div>
  );
}

describe('useServiceWorkerUpdate', () => {
  let originalServiceWorker;

  beforeEach(() => {
    originalServiceWorker = navigator.serviceWorker;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: originalServiceWorker, configurable: true });
  });

  it('stays "none" when the browser has no serviceWorker support at all', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('status').textContent).toBe('none');
  });

  it('stays "none" when there is a registration but nothing is waiting', async () => {
    const registration = new FakeRegistration();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: () => Promise.resolve(registration), addEventListener: vi.fn() },
      configurable: true,
    });

    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(getByTestId('status').textContent).toBe('none'));
  });

  it('reports "available" when a worker is already waiting by the time the hook mounts', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWaitingWorker();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: () => Promise.resolve(registration), addEventListener: vi.fn() },
      configurable: true,
    });

    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(getByTestId('status').textContent).toBe('available'));
  });

  it('applyUpdate() posts SKIP_WAITING to the waiting worker', async () => {
    const registration = new FakeRegistration();
    const waitingWorker = new FakeWaitingWorker();
    registration.waiting = waitingWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: () => Promise.resolve(registration), addEventListener: vi.fn() },
      configurable: true,
    });

    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(getByTestId('status').textContent).toBe('available'));

    act(() => {
      getByTestId('status').closest('div').querySelector('button').click();
    });
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('detects a worker that starts waiting only after install completes (updatefound -> statechange)', async () => {
    const registration = new FakeRegistration();
    const installingWorker = new FakeRegistration(); // reuse as a minimal addEventListener/emit-capable stand-in
    installingWorker.state = 'installing';
    registration.installing = installingWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: () => Promise.resolve(registration),
        controller: {}, // a controller already exists -- this is an UPDATE, not the first install
      },
      configurable: true,
    });

    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(getByTestId('status').textContent).toBe('none'));

    act(() => {
      registration.emit('updatefound');
    });
    // simulate the installing worker finishing installation
    registration.waiting = new FakeWaitingWorker();
    installingWorker.state = 'installed';
    act(() => {
      installingWorker.emit('statechange');
    });

    await waitFor(() => expect(getByTestId('status').textContent).toBe('available'));
  });
});
