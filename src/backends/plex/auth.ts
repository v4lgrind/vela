import { AuthError, connectionKey } from '@/domain';
import type {
  AuthProfile,
  AuthServer,
  AuthStep,
  Authenticator,
  ClientIdentity,
  DeviceCodeSession,
  DeviceCodeStatus,
  ServerConnection,
  ServerUser,
} from '@/domain';

import { orderConnections, raceConnections, savedConnections, type PlexConnection } from './connect';
import { PLEX_TV, PlexHttpError, plexHeaders, plexJson } from './http';

const LINK_URL = 'https://plex.tv/link';
/** Used when plex.tv does not say when the code expires. */
const DEFAULT_PIN_LIFETIME_MS = 15 * 60 * 1000;

interface PlexPin {
  id: number;
  code: string;
  expiresAt?: string;
  expiresIn?: number;
  authToken?: string | null;
}

interface PlexAccount {
  id: number;
  uuid: string;
  username?: string;
  title?: string;
  thumb?: string;
}

/** `GET /api/v2/home/users`: one entry per Home profile (managed or not). */
interface PlexHomeUser {
  id: number;
  uuid: string;
  title?: string;
  username?: string;
  thumb?: string;
  admin?: boolean;
  /** A PIN guards the profile. */
  protected?: boolean;
}

interface PlexSwitchedUser extends PlexAccount {
  authToken: string;
}

export interface PlexResource {
  name: string;
  clientIdentifier: string;
  provides: string;
  owned?: boolean;
  presence?: boolean;
  /** Token of this user on this server; what PMS requests must carry. */
  accessToken?: string;
  connections?: PlexConnection[];
}

function toAuthError(error: unknown, statusReasons: Record<number, AuthError['reason']> = {}): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof PlexHttpError) return new AuthError(statusReasons[error.status] ?? 'unknown', error.message, error.status);
  return new AuthError('unreachable', error instanceof Error ? error.message : String(error));
}

const PIN_ERRORS: Record<number, AuthError['reason']> = { 401: 'invalid-credentials', 403: 'invalid-credentials' };

export const plexAccountKey = (accountUuid: string) => `plex-account:${accountUuid}`;

function pinExpiry(pin: PlexPin): number {
  const parsed = pin.expiresAt ? Date.parse(pin.expiresAt) : NaN;
  if (!Number.isNaN(parsed)) return parsed;
  return Date.now() + (pin.expiresIn ? pin.expiresIn * 1000 : DEFAULT_PIN_LIFETIME_MS);
}

const isServer = (resource: PlexResource) => resource.provides.split(',').includes('server');

const userOf = (user: PlexAccount): ServerUser => ({
  id: user.uuid,
  name: user.title || user.username || '',
  avatarUrl: user.thumb || undefined,
});

export function createPlexAuthenticator(identity: ClientIdentity): Authenticator {
  const tv = <T>(path: string, clientId: string, token?: string, method: 'GET' | 'POST' = 'GET', params?: Record<string, string | undefined>) =>
    plexJson<T>({ baseUrl: PLEX_TV, path, method, params, headers: plexHeaders(identity, clientId, token) });

  async function connect(resource: PlexResource, user: ServerUser, account: { uuid: string; token: string }, clientId: string): Promise<AuthStep> {
    if (!resource.accessToken) throw new AuthError('invalid-credentials', 'This profile has no access to the server');
    const connections = orderConnections(resource.connections ?? []);
    let baseUrl: string;
    try {
      baseUrl = await raceConnections(connections, resource.clientIdentifier, plexHeaders(identity, clientId, resource.accessToken));
    } catch (error) {
      throw toAuthError(error);
    }
    const base = { kind: 'plex' as const, serverId: resource.clientIdentifier, user };
    const connection: ServerConnection = {
      ...base,
      serverName: resource.name,
      baseUrl,
      candidateUrls: connections.map((c) => c.uri),
      tokenKey: connectionKey(base),
      deviceId: clientId,
      accountKey: plexAccountKey(account.uuid),
    };
    return { step: 'connected', connection, token: resource.accessToken, account: { key: connection.accountKey!, token: account.token } };
  }

  /** Servers this user can open; a single server is chosen right away. */
  async function serverStep(user: ServerUser, userToken: string, account: { uuid: string; token: string }, clientId: string): Promise<AuthStep> {
    let resources: PlexResource[];
    try {
      resources = (await tv<PlexResource[]>('/api/v2/resources?includeHttps=1&includeRelay=1', clientId, userToken)).filter(isServer);
    } catch (error) {
      throw toAuthError(error);
    }
    if (!resources.length) throw new AuthError('unknown', 'No Plex server is shared with this profile');
    if (resources.length === 1) return connect(resources[0], user, account, clientId);
    const servers: AuthServer[] = resources.map((r) => ({ id: r.clientIdentifier, name: r.name, isOwned: !!r.owned, isOnline: r.presence !== false }));
    return {
      step: 'choose-server',
      servers,
      choose: async (serverId) => {
        const resource = resources.find((r) => r.clientIdentifier === serverId);
        if (!resource) throw new AuthError('unknown', 'Unknown server');
        return connect(resource, user, account, clientId);
      },
    };
  }

  async function switchTo(profile: PlexHomeUser, accountToken: string, clientId: string, pin?: string): Promise<PlexSwitchedUser> {
    try {
      return await tv<PlexSwitchedUser>(`/api/v2/home/users/${profile.uuid}/switch`, clientId, accountToken, 'POST', { pin });
    } catch (error) {
      throw toAuthError(error, PIN_ERRORS);
    }
  }

  /** Home profiles of the account; without a Home, the account itself. */
  async function profileStep(accountToken: string, clientId: string): Promise<AuthStep> {
    let account: PlexAccount;
    try {
      account = await tv<PlexAccount>('/api/v2/user', clientId, accountToken);
    } catch (error) {
      throw toAuthError(error, PIN_ERRORS);
    }
    const accountRef = { uuid: account.uuid, token: accountToken };
    const users = await tv<{ users?: PlexHomeUser[] }>('/api/v2/home/users', clientId, accountToken)
      .then((home) => home.users ?? [])
      .catch(() => [] as PlexHomeUser[]);
    if (users.length <= 1) return serverStep(userOf(account), accountToken, accountRef, clientId);

    const profiles: AuthProfile[] = users.map((user) => ({
      id: user.uuid,
      name: user.title || user.username || '',
      avatarUrl: user.thumb || undefined,
      isAdmin: !!user.admin,
      needsPin: !!user.protected,
    }));
    return {
      step: 'choose-profile',
      profiles,
      choose: async (profileId, pin) => {
        const profile = users.find((user) => user.uuid === profileId);
        if (!profile) throw new AuthError('unknown', 'Unknown profile');
        const switched = await switchTo(profile, accountToken, clientId, pin);
        return serverStep(userOf(switched), switched.authToken, accountRef, clientId);
      },
    };
  }

  async function startDeviceCode(clientId: string): Promise<DeviceCodeSession> {
    let pin: PlexPin;
    try {
      pin = await tv<PlexPin>('/api/v2/pins', clientId, undefined, 'POST', { strong: 'false' });
    } catch (error) {
      throw toAuthError(error);
    }
    const expiresAtMs = pinExpiry(pin);
    let isCancelled = false;

    async function poll(): Promise<DeviceCodeStatus> {
      if (isCancelled || Date.now() > expiresAtMs) return { status: 'expired' };
      let state: PlexPin;
      try {
        state = await tv<PlexPin>(`/api/v2/pins/${pin.id}`, clientId);
      } catch (error) {
        if (error instanceof PlexHttpError && error.status === 404) return { status: 'expired' };
        throw toAuthError(error);
      }
      if (!state.authToken) return { status: 'pending' };
      return { status: 'approved', next: await profileStep(state.authToken, clientId) };
    }

    return {
      challenge: { code: pin.code, verificationUrl: LINK_URL, expiresAtMs },
      poll,
      cancel: () => { isCancelled = true; },
    };
  }

  /** The address that answers now (LAN at home, public or relay outside). */
  async function reconnect(connection: ServerConnection, token: string): Promise<string> {
    const headers = plexHeaders(identity, connection.deviceId, token);
    return raceConnections(savedConnections(connection.baseUrl, connection.candidateUrls), connection.serverId, headers);
  }

  return {
    kind: 'plex',
    supportsPassword: false,
    supportsDeviceCode: true,
    startDeviceCode,
    resumeAccount: profileStep,
    reconnect,
  };
}
