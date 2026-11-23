import type { ClientIdentity, ServerConnection } from '@/domain';

import { plexHeaders, plexJson, plexSend, withParams } from './http';
import type { PlexContainer, PlexMetadata } from './types';

export type Params = Record<string, string | number | boolean | undefined>;

/** Window of a list; Plex honours the size only together with the start. */
export interface Window {
  offset: number;
  limit: number;
}

/** Requests to one Plex Media Server, as one user (the server token of that user). */
export class PlexClient {
  readonly headers: Record<string, string>;

  constructor(
    readonly connection: ServerConnection,
    readonly token: string,
    readonly identity: ClientIdentity,
  ) {
    this.headers = plexHeaders(identity, connection.deviceId, token);
  }

  get baseUrl(): string {
    return this.connection.baseUrl;
  }

  get<T = PlexContainer>(path: string, params: Params = {}, window?: Window): Promise<T> {
    const paging = window ? { 'X-Plex-Container-Start': window.offset, 'X-Plex-Container-Size': window.limit } : {};
    return plexJson<T>({ baseUrl: this.baseUrl, path, params: { ...params, ...paging }, headers: this.headers });
  }

  async metadata(path: string, params: Params = {}, window?: Window): Promise<PlexMetadata[]> {
    return (await this.get(path, params, window)).MediaContainer.Metadata ?? [];
  }

  send(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params: Params = {}): Promise<void> {
    return plexSend({ baseUrl: this.baseUrl, path, method, params, headers: this.headers });
  }

  /** Absolute URL carrying the token, for players and `<img>` that cannot send headers. */
  url(path: string, params: Params = {}): string {
    return `${this.baseUrl}${withParams(path, { ...params, 'X-Plex-Token': this.token })}`;
  }
}
