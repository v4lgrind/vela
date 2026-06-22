import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  const { toasts, show, showError, showSuccess, showWarning, dismiss } = useToast();

  beforeEach(() => {
    // Shared module-level state — reset between tests
    toasts.value.splice(0, toasts.value.length);
    vi.useRealTimers();
  });

  it('pushes a toast with a unique incrementing id', () => {
    show('first');
    show('second');
    expect(toasts.value).toHaveLength(2);
    expect(toasts.value[1].id).toBeGreaterThan(toasts.value[0].id);
    expect(toasts.value[0].message).toBe('first');
  });

  it('defaults the type to info and honours the typed helpers', () => {
    show('plain');
    showError('boom');
    showSuccess('yay');
    showWarning('careful');
    const types = toasts.value.map(t => t.type);
    expect(types).toEqual(['info', 'error', 'success', 'warning']);
  });

  it('dismiss removes the matching toast by id and ignores unknown ids', () => {
    show('keep');
    show('drop');
    const dropId = toasts.value[1].id;
    dismiss(dropId);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].message).toBe('keep');
    dismiss(999999); // no-op
    expect(toasts.value).toHaveLength(1);
  });

  it('auto-dismisses after the duration elapses', () => {
    vi.useFakeTimers();
    show('temp', 'info', 4000);
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.value).toHaveLength(0);
  });
});
