import type { ClientIdentity, ServerConnection } from '@/domain';

import { jellyfinAuthHeader, jellyfinJson } from './http';

export type QueryValue = string | number | boolean | string[] | undefined | null;
export type Query = Record<string, QueryValue>;

/**
 * Lists are sent as repeated parameters (`fields=A&fields=B`), like the official
 * SDK: every Jellyfin route accepts that form, while some (MediaSegments) reject
 * comma-joined values.
 */
export function toQueryString(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else params.set(key, String(value));
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

  post<T>(path: string, query: Query, body: unknown): Promise<T> {
    return jellyfinJson<T>({
      serverUrl: this.serverUrl, path: path + toQueryString(query), authorization: this.authorization, method: 'POST', body,
    });
  }

  async send(
    method: 'POST' | 'DELETE', path: string, query: Query = {}, body?: unknown,
    init: Pick<RequestInit, 'signal' | 'keepalive'> = {},
  ): Promise<void> {
    const response = await fetch(this.serverUrl + path + toQueryString(query), {
      ...init,
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
