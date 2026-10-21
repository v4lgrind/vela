import { describe, it, expect, vi } from 'vitest';

import { offlineDetection } from './offlineDetection';

describe('offlineDetection', () => {
  it('follows the device connectivity events', () => {
    window.dispatchEvent(new Event('offline'));
    expect(offlineDetection.isFullyOnline).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(offlineDetection.isFullyOnline).toBe(true);
  });

  it('never pings the server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    window.dispatchEvent(new Event('online'));

    expect(await offlineDetection.checkNow()).toBe(navigator.onLine);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
