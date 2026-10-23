import { onScopeDispose, watch, type Ref } from 'vue';

const RETRY_INTERVAL_MS = 5_000;

/**
 * Retries `retry` while `failed` is true: right away when the app comes back
 * to the foreground or the device reconnects, and every 5 s while it is on
 * screen. Android cuts a backgrounded app's network (screen locked, Doze)
 * without any `offline` event, so a load that failed then would otherwise
 * stay failed.
 */
export function useRetryWhileFailed(failed: Ref<boolean>, retry: () => unknown) {
  let timer: ReturnType<typeof setInterval> | null = null;

  const retryIfFailed = () => {
    if (failed.value && document.visibilityState !== 'hidden') retry();
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  watch(failed, (isFailed) => {
    stop();
    if (isFailed) timer = setInterval(retryIfFailed, RETRY_INTERVAL_MS);
  }, { immediate: true });

  document.addEventListener('visibilitychange', retryIfFailed);
  window.addEventListener('online', retryIfFailed);

  onScopeDispose(() => {
    stop();
    document.removeEventListener('visibilitychange', retryIfFailed);
    window.removeEventListener('online', retryIfFailed);
  });
}
