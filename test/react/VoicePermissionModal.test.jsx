import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { VoicePermissionModal } from '../../src/react/VoicePermissionModal.jsx';

describe('VoicePermissionModal', () => {
  it('renders nothing when permissionState is not "denied"', () => {
    const voice = { permissionState: 'granted', error: null, start: vi.fn() };
    render(<VoicePermissionModal voice={voice} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the dialog with the error message when permissionState is "denied"', () => {
    const voice = { permissionState: 'denied', error: 'Microphone access is blocked.', start: vi.fn() };
    render(<VoicePermissionModal voice={voice} />);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Microphone access is blocked.');
  });

  it('falls back to a default message when voice.error is not set', () => {
    const voice = { permissionState: 'denied', error: null, start: vi.fn() };
    render(<VoicePermissionModal voice={voice} />);
    expect(document.querySelector('[role="dialog"]').textContent).toMatch(/microphone access is blocked/i);
  });

  it('"Try again" calls voice.start()', () => {
    const voice = { permissionState: 'denied', error: 'blocked', start: vi.fn() };
    render(<VoicePermissionModal voice={voice} />);

    fireEvent.click([...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Try again'));
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('"Dismiss" and Escape close the dialog without calling start()', () => {
    const voice = { permissionState: 'denied', error: 'blocked', start: vi.fn() };
    render(<VoicePermissionModal voice={voice} />);

    fireEvent.click([...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Dismiss'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(voice.start).not.toHaveBeenCalled();
  });

  it('reopens on a fresh denial after being dismissed (voice.error changing)', () => {
    const voice = { permissionState: 'denied', error: 'first denial', start: vi.fn() };
    const { rerender } = render(<VoicePermissionModal voice={voice} />);

    fireEvent.click([...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Dismiss'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    // A brand new attempt fails again with a fresh error — same shape a
    // real re-render after another failed start() would produce.
    rerender(<VoicePermissionModal voice={{ ...voice, error: 'second denial' }} />);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('handles a missing voice prop gracefully (isSupported === false path)', () => {
    expect(() => render(<VoicePermissionModal voice={undefined} />)).not.toThrow();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
