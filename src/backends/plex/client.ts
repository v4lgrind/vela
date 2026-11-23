import type { BackendEvents, ClientIdentity, ServerConnection } from '@/domain';

import { raceConnections, savedConnections } from './connect';
import { PlexUnreachableError, plexHeaders, plexJson, plexSend, withParams } from './http';
import type { PlexContainer, PlexMetadata } from './types';

export type Params = Record<string, string | number | boolean | undefined>;

/** Window of a list; Plex honours the size only together with the start. */
export interface Window {
  offset: number;
  limit: number;
}

/**
 * Requests to one Plex Media Server, as one user (the server token of that user).
 * When the current address stops answering (the phone left home, changed network),
 * the client moves to the saved address that answers and repeats the request once.
 */
export class PlexClient {
  readonly headers: Record<string, string>;
  /** Address in use; changes when the client moves to another address of the server. */
  baseUrl: string;
  private relocation: Promise<string> | null = null;

  constructor(
    readonly connection: ServerConnection,
    readonly token: string,
    readonly identity: ClientIdentity,
    private readonly events: BackendEvents = {},
  ) {
    this.headers = plexHeaders(identity, connection.deviceId, token);
    this.baseUrl = connection.baseUrl;
  }

  get<T = PlexContainer>(path: string, params: Params = {}, window?: Window): Promise<T> {
    const paging = window ? { 'X-Plex-Container-Start': window.offset, 'X-Plex-Container-Size': window.limit } : {};
    return this.withFailover((baseUrl) => plexJson<T>({ baseUrl, path, params: { ...params, ...paging }, headers: this.headers }));
  }

  async metadata(path: string, params: Params = {}, window?: Window): Promise<PlexMetadata[]> {
    return (await this.get(path, params, window)).MediaContainer.Metadata ?? [];
  }

  send(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params: Params = {}): Promise<void> {
    return this.withFailover((baseUrl) => plexSend({ baseUrl, path, method, params, headers: this.headers }));
  }

  /** Absolute URL carrying the token, for players and `<img>` that cannot send headers. */
  url(path: string, params: Params = {}): string {
    return `${this.baseUrl}${withParams(path, { ...params, 'X-Plex-Token': this.token })}`;
  }

  private async withFailover<T>(request: (baseUrl: string) => Promise<T>): Promise<T> {
    const tried = this.baseUrl;
    try {
      return await request(tried);
    } catch (error) {
      if (!(error instanceof PlexUnreachableError)) throw error;
      const next = this.baseUrl !== tried ? this.baseUrl : await this.relocate().catch(() => null);
      if (!next || next === tried) throw error;
      return request(next);
    }
  }

  /** One search at a time, however many requests failed together. */
  private relocate(): Promise<string> {
    this.relocation ??= raceConnections(
      savedConnections(this.baseUrl, this.connection.candidateUrls),
      this.connection.serverId,
      this.headers,
    ).then((baseUrl) => {
      if (baseUrl !== this.baseUrl) {
        this.baseUrl = baseUrl;
        this.events.onConnectionChange?.({ ...this.connection, baseUrl });
      }
      return baseUrl;
    }).finally(() => {
      this.relocation = null;
    });
    return this.relocation;
  }
}
