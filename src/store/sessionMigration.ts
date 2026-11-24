import { connectionKey } from '@/domain';
import type { ServerConnection } from '@/domain';

/** Shape persisted by the old `jellyfin` store (localStorage key `jellyfin`). */
export interface LegacyJellyfinState {
  serverUrl?: string;
  _qcDeviceId?: string;
  savedServers?: {
    serverUrl: string;
    userId: string;
    userName?: string;
    serverName?: string;
    accessToken?: string;
  }[];
}

export interface LegacyTokens {
  /** `jellyfin_user_id`: the user signed in when the app last ran. */
  activeUserId: string | null;
  /** `jellyfin_access_token` (+ its localStorage fallback). */
  activeToken: string | null;
  /** `jellyfin_token_<userId>` per saved account. */
  tokenByUser: Record<string, string | null>;
}

export interface MigrationResult {
  connections: ServerConnection[];
  activeKey: string | null;
  tokens: Record<string, string>;
}

/**
 * Old installs did not store the Jellyfin server id; `url:<address>` stands in
 * and stays stable as long as the address does. A new sign-in supersedes it.
 */
export function legacyServerId(serverUrl: string): string {
  return `url:${serverUrl}`;
}

function legacyConnection(serverUrl: string, userId: string, userName: string, serverName: string, deviceId: string): ServerConnection {
  const base = { kind: 'jellyfin' as const, serverId: legacyServerId(serverUrl), user: { id: userId, name: userName } };
  return {
    ...base,
    serverName,
    baseUrl: serverUrl,
    candidateUrls: [],
    tokenKey: connectionKey(base),
    deviceId,
  };
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

type LegacyServer = NonNullable<LegacyJellyfinState['savedServers']>[number];

/** Very old installs had a signed-in user without a saved-servers entry. */
function withActiveEntry(legacy: LegacyJellyfinState, tokens: LegacyTokens): LegacyServer[] {
  const saved = [...(legacy.savedServers ?? [])];
  const activeUrl = legacy.serverUrl;
  if (!activeUrl || !tokens.activeUserId || !tokens.activeToken) return saved;
  const hasEntry = saved.some((s) => s.serverUrl === activeUrl && s.userId === tokens.activeUserId);
  if (!hasEntry) saved.push({ serverUrl: activeUrl, userId: tokens.activeUserId, userName: '', serverName: hostname(activeUrl) });
  return saved;
}

function tokenFor(server: LegacyServer, isActive: boolean, tokens: LegacyTokens): string | null {
  const active = isActive ? tokens.activeToken : null;
  return active ?? tokens.tokenByUser[server.userId] ?? server.accessToken ?? null;
}

/** Converts the old saved-servers list and its tokens into session connections. Pure. */
export function migrateLegacySession(legacy: LegacyJellyfinState, tokens: LegacyTokens, fallbackDeviceId: string): MigrationResult {
  const deviceId = legacy._qcDeviceId || fallbackDeviceId;
  const result: MigrationResult = { connections: [], activeKey: null, tokens: {} };
  for (const server of withActiveEntry(legacy, tokens)) {
    const serverName = server.serverName || hostname(server.serverUrl);
    const connection = legacyConnection(server.serverUrl, server.userId, server.userName ?? '', serverName, deviceId);
    const isActive = server.serverUrl === legacy.serverUrl && server.userId === tokens.activeUserId;
    const token = tokenFor(server, isActive, tokens);
    result.connections.push(connection);
    if (token) result.tokens[connection.tokenKey] = token;
    if (isActive && token) result.activeKey = connection.tokenKey;
  }
  return result;
}
