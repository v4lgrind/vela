import type { ServerConnection, ServerKind } from '@/domain';

const DEFAULT_MAX_BITRATE = 140_000_000;

export interface AutoLibraryConfig {
  kind: ServerKind;
  serverUrl: string;
  accessToken: string;
  userId: string;
  /** Client id the token was issued to (Plex sends it with every request). */
  clientId: string;
  maxBitrate: number;
}

/**
 * Credentials for the native music library Android Auto browses while the app
 * is closed: the active account when its server supports it, empty otherwise.
 */
export function autoLibraryConfig(state: {
  active: ServerConnection | null;
  token: string | null;
  androidAuto: boolean;
  maxBitrate: number;
}): AutoLibraryConfig {
  const maxBitrate = state.maxBitrate || DEFAULT_MAX_BITRATE;
  const { active, token } = state;
  if (!active || !token || !state.androidAuto) {
    return { kind: 'jellyfin', serverUrl: '', accessToken: '', userId: '', clientId: '', maxBitrate };
  }
  return { kind: active.kind, serverUrl: active.baseUrl, accessToken: token, userId: active.user.id, clientId: active.deviceId, maxBitrate };
}
