import { AuthError, connectionKey } from '@/domain';
import type {
  AuthStep,
  Authenticator,
  ClientIdentity,
  DeviceCodeSession,
  DeviceCodeStatus,
  PasswordSignIn,
  ServerConnection,
} from '@/domain';

import { JellyfinHttpError, jellyfinAuthHeader, jellyfinJson } from './http';

/** Quick Connect codes are abandoned after this long (the server keeps them ~10 min). */
const DEVICE_CODE_LIFETIME_MS = 5 * 60 * 1000;

interface AuthenticationResult {
  AccessToken?: string;
  ServerId?: string;
  User?: { Id?: string; Name?: string };
}

interface PublicSystemInfo {
  Id?: string;
  ServerName?: string;
}

function toAuthError(error: unknown, statusReasons: Record<number, AuthError['reason']>): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof JellyfinHttpError) {
    return new AuthError(statusReasons[error.status] ?? 'unknown', error.message, error.status);
  }
  return new AuthError('unreachable', error instanceof Error ? error.message : String(error));
}

const PASSWORD_ERRORS: Record<number, AuthError['reason']> = { 401: 'invalid-credentials', 403: 'invalid-credentials' };
const DEVICE_CODE_ERRORS: Record<number, AuthError['reason']> = {
  400: 'device-code-disabled',
  401: 'device-code-disabled',
  403: 'device-code-disabled',
  404: 'device-code-unsupported',
};

export function createJellyfinAuthenticator(identity: ClientIdentity): Authenticator {
  async function publicInfo(serverUrl: string, deviceId: string): Promise<PublicSystemInfo> {
    try {
      return await jellyfinJson<PublicSystemInfo>({
        serverUrl,
        path: '/System/Info/Public',
        authorization: jellyfinAuthHeader(identity, deviceId),
      });
    } catch {
      return {};
    }
  }

  async function connected(serverUrl: string, deviceId: string, result: AuthenticationResult): Promise<AuthStep> {
    if (!result.AccessToken || !result.User?.Id) throw new AuthError('unknown', 'Server returned no access token');
    const info = await publicInfo(serverUrl, deviceId);
    const base = {
      kind: 'jellyfin' as const,
      serverId: result.ServerId ?? info.Id ?? `url:${serverUrl}`,
      user: { id: result.User.Id, name: result.User.Name ?? '' },
    };
    const connection: ServerConnection = {
      ...base,
      serverName: info.ServerName ?? new URL(serverUrl).hostname,
      baseUrl: serverUrl,
      candidateUrls: [],
      tokenKey: connectionKey(base),
      deviceId,
    };
    return { step: 'connected', connection, token: result.AccessToken };
  }

  async function signInWithPassword(request: PasswordSignIn): Promise<AuthStep> {
    try {
      const result = await jellyfinJson<AuthenticationResult>({
        serverUrl: request.serverUrl,
        path: '/Users/AuthenticateByName',
        method: 'POST',
        authorization: jellyfinAuthHeader(identity, request.deviceId),
        body: { Username: request.username, Pw: request.password },
      });
      return await connected(request.serverUrl, request.deviceId, result);
    } catch (error) {
      throw toAuthError(error, PASSWORD_ERRORS);
    }
  }

  async function startDeviceCode(deviceId: string, serverUrl?: string): Promise<DeviceCodeSession> {
    if (!serverUrl) throw new AuthError('unknown', 'Quick Connect needs a server address');
    const authorization = jellyfinAuthHeader(identity, deviceId);
    let initiated: { Code: string; Secret: string };
    try {
      initiated = await jellyfinJson({ serverUrl, path: '/QuickConnect/Initiate', method: 'POST', authorization });
    } catch (error) {
      throw toAuthError(error, DEVICE_CODE_ERRORS);
    }
    const expiresAtMs = Date.now() + DEVICE_CODE_LIFETIME_MS;
    let isCancelled = false;

    async function poll(): Promise<DeviceCodeStatus> {
      if (isCancelled || Date.now() > expiresAtMs) return { status: 'expired' };
      const secret = encodeURIComponent(initiated.Secret);
      const state = await jellyfinJson<{ Authenticated?: boolean }>({
        serverUrl: serverUrl!, path: `/QuickConnect/Connect?Secret=${secret}`, authorization,
      });
      if (!state.Authenticated) return { status: 'pending' };
      const result = await jellyfinJson<AuthenticationResult>({
        serverUrl: serverUrl!,
        path: '/Users/AuthenticateWithQuickConnect',
        method: 'POST',
        authorization,
        body: { Secret: initiated.Secret },
      });
      return { status: 'approved', next: await connected(serverUrl!, deviceId, result) };
    }

    return {
      challenge: { code: initiated.Code, expiresAtMs },
      poll,
      cancel: () => { isCancelled = true; },
    };
  }

  return {
    kind: 'jellyfin',
    supportsPassword: true,
    supportsDeviceCode: true,
    signInWithPassword,
    startDeviceCode,
  };
}
