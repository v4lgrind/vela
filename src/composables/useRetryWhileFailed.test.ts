import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { useRetryWhileFailed } from './useRetryWhileFailed';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const failed = ref(false);
  const retry = vi.fn();
  const scope = effectScope();
  scope.run(() => useRetryWhileFailed(failed, retry));
  return { failed, retry, scope };
}

describe('useRetryWhileFailed', () => {
  it('retries every 5 s while failed, then stops', async () => {
    const { failed, retry } = setup();
    vi.advanceTimersByTime(10_000);
    expect(retry).not.toHaveBeenCalled();

    failed.value = true;
    await nextTick();
    vi.advanceTimersByTime(10_000);
    expect(retry).toHaveBeenCalledTimes(2);

    failed.value = false;
    await nextTick();
    vi.advanceTimersByTime(10_000);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('retries at once when the app comes back or the device reconnects', async () => {
    const { failed, retry } = setup();
    failed.value = true;
    await nextTick();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('stops when its scope is disposed', async () => {
    const { failed, retry, scope } = setup();
    failed.value = true;
    await nextTick();
    scope.stop();
    vi.advanceTimersByTime(10_000);
    window.dispatchEvent(new Event('online'));
    expect(retry).not.toHaveBeenCalled();
  });
});
