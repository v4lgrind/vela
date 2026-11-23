import type { ClientIdentity } from '@/domain';

export const PLEX_TV = 'https://plex.tv';

/** Error carrying the HTTP status, so callers can map it to a domain error. */
export class PlexHttpError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Plex ${path.split('?')[0]} failed with status ${status}`);
    this.name = 'PlexHttpError';
  }
}

/** `X-Plex-*` headers identifying Vela (and the user, with a token). */
export function plexHeaders(identity: ClientIdentity, clientId: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Product': identity.product,
    'X-Plex-Version': identity.version,
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Platform': 'Android',
    'X-Plex-Device': identity.deviceName,
    'X-Plex-Device-Name': identity.deviceName,
  };
  if (token) headers['X-Plex-Token'] = token;
  return headers;
}

export interface PlexRequest {
  baseUrl: string;
  path: string;
  headers: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Form fields (sent as the query string, as Plex clients do). */
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export function withParams(path: string, params: PlexRequest['params']): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  if (!text) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${text}`;
}

async function send(request: PlexRequest): Promise<Response> {
  const path = withParams(request.path, request.params);
  const response = await fetch(`${request.baseUrl}${path}`, {
    method: request.method ?? 'GET',
    headers: request.headers,
    signal: request.signal,
  });
  if (!response.ok) throw new PlexHttpError(response.status, request.path);
  return response;
}

export async function plexJson<T>(request: PlexRequest): Promise<T> {
  const response = await send(request);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** For calls whose answer Vela ignores (timeline, scrobble, stop). */
export async function plexSend(request: PlexRequest): Promise<void> {
  await send(request);
}
