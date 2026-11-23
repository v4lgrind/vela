import type { ClientIdentity } from '@/domain';

/** Error carrying the HTTP status, so callers can map it to a domain error. */
export class JellyfinHttpError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Jellyfin ${path} failed with status ${status}`);
    this.name = 'JellyfinHttpError';
  }
}

/** `MediaBrowser` authorization header; values are percent-encoded as Jellyfin expects. */
export function jellyfinAuthHeader(identity: ClientIdentity, deviceId: string, token?: string): string {
  const fields: [string, string][] = [
    ['Client', identity.product],
    ['Device', identity.deviceName],
    ['DeviceId', deviceId],
    ['Version', identity.version],
  ];
  if (token) fields.push(['Token', token]);
  return `MediaBrowser ${fields.map(([key, value]) => `${key}="${encodeURIComponent(value)}"`).join(', ')}`;
}

export interface JellyfinRequest {
  serverUrl: string;
  path: string;
  authorization: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

export async function jellyfinJson<T>(request: JellyfinRequest): Promise<T> {
  const headers: Record<string, string> = { Authorization: request.authorization, Accept: 'application/json' };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${request.serverUrl}${request.path}`, {
    method: request.method ?? 'GET',
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  if (!response.ok) throw new JellyfinHttpError(response.status, request.path);
  return response.json() as Promise<T>;
}
