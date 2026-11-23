export type ServerKind = 'jellyfin' | 'plex';

/** Features a server supports; the UI hides the rest. */
export interface Capabilities {
  music: boolean;
  downloads: boolean;
  transcodedDownloads: boolean;
  markers: boolean;
  chapters: boolean;
  trickplay: boolean;
  lyrics: boolean;
  favorites: boolean;
  similar: boolean;
  personPages: boolean;
  serverStreamInfo: boolean;
  cast: boolean;
  androidAuto: boolean;
}

export interface ServerUser {
  id: string;
  name: string;
  /** Avatar URL when the server provides one. */
  avatarUrl?: string;
}

/**
 * A signed-in (server, user) pair. Persisted in the saved-accounts list; the
 * token itself lives in secure storage under `tokenKey`.
 */
export interface ServerConnection {
  /** Stable server id (Jellyfin ServerId, Plex machineIdentifier). */
  serverId: string;
  kind: ServerKind;
  serverName: string;
  user: ServerUser;
  /** Address last known to work. */
  baseUrl: string;
  /** Other addresses to race when `baseUrl` stops answering (Plex). */
  candidateUrls: string[];
  tokenKey: string;
  /** Device / client identifier the token was issued to; sent with every request. */
  deviceId: string;
}

/** How Vela introduces itself to servers. */
export interface ClientIdentity {
  product: string;
  version: string;
  deviceName: string;
  platform: string;
}

export function connectionKey(connection: Pick<ServerConnection, 'kind' | 'serverId' | 'user'>): string {
  return `${connection.kind}:${connection.serverId}:${connection.user.id}`;
}
