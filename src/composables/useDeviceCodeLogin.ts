import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { AuthError } from '@/domain';
import type { AuthStep, DeviceCodeSession, ServerKind } from '@/domain';
import { useSessionStore } from '@/store/session-store';
import { authMessage } from '@/utils/authMessage';

const POLL_INTERVAL_MS = 2000;

/**
 * Device-code sign-in (Jellyfin Quick Connect, plex.tv/link): shows the code,
 * polls until it is approved, then hands the next step to `onStep`.
 */
export function useDeviceCodeLogin(onStep: (step: AuthStep) => void) {
  const { t } = useI18n();
  const session = useSessionStore();
  const active = ref(false);
  const code = ref('');
  const verificationUrl = ref<string | undefined>();
  const error = ref<string | null>(null);
  let deviceSession: DeviceCodeSession | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let isPolling = false;

  function cancel() {
    deviceSession?.cancel();
    deviceSession = null;
    active.value = false;
    code.value = '';
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function poll() {
    if (!deviceSession || isPolling) return;
    isPolling = true;
    try {
      const state = await deviceSession.poll();
      if (state.status === 'expired') {
        cancel();
        error.value = t('login.qcTimeout');
      } else if (state.status === 'approved') {
        cancel();
        onStep(state.next);
      }
    } catch (e) {
      // Network blips are retried; a refused profile or server ends the attempt.
      if (e instanceof AuthError) {
        cancel();
        error.value = authMessage(t, e);
      }
    } finally {
      isPolling = false;
    }
  }

  async function start(kind: ServerKind, serverUrl?: string) {
    error.value = null;
    try {
      deviceSession = await session.startDeviceCode(kind, serverUrl);
      code.value = deviceSession.challenge.code;
      verificationUrl.value = deviceSession.challenge.verificationUrl;
      active.value = true;
      timer = setInterval(poll, POLL_INTERVAL_MS);
    } catch (e) {
      error.value = authMessage(t, e);
    }
  }

  return { active, code, verificationUrl, error, start, cancel };
}
