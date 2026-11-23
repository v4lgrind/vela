import type { ClientIdentity, ServerConnection } from '@/domain';

import { jellyfinAuthHeader, jellyfinJson } from './http';

export type QueryValue = string | number | boolean | string[] | undefined | null;
export type Query = Record<string, QueryValue>;

/** Jellyfin list parameters are comma-separated, except `genres` which uses '|'. */
const PIPE_SEPARATED = new Set(['genres']);

export function toQueryString(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(PIPE_SEPARATED.has(key) ? '|' : ','));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Authenticated access to one Jellyfin server for one user. */
export class JellyfinClient {
  readonly authorization: string;

  constructor(
    readonly connection: ServerConnection,
    readonly token: string,
    identity: ClientIdentity,
  ) {
    this.authorization = jellyfinAuthHeader(identity, connection.deviceId, token);
  }

  get serverUrl(): string {
    return this.connection.baseUrl;
  }

  get userId(): string {
    return this.connection.user.id;
  }

  get<T>(path: string, query: Query = {}): Promise<T> {
    return jellyfinJson<T>({ serverUrl: this.serverUrl, path: path + toQueryString(query), authorization: this.authorization });
  }

  async send(method: 'POST' | 'DELETE', path: string, query: Query = {}, body?: unknown): Promise<void> {
    const response = await fetch(this.serverUrl + path + toQueryString(query), {
      method,
      headers: {
        Authorization: this.authorization,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Jellyfin ${method} ${path} failed with status ${response.status}`);
  }
}
