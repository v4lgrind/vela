import type { ClientIdentity } from '@/domain';

export const PLEX_TV = 'https://plex.tv';

/** No answer at all (no route, dead connection, time limit): another address of the server may work. */
export class PlexUnreachableError extends Error {
  constructor(path: string) {
    super(`Plex ${path.split('?')[0]} got no answer`);
    this.name = 'PlexUnreachableError';
  }
}

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

/**
 * Longest wait for one answer. After a network change a request can sit on a
 * dead connection without ever failing; without a limit the screens that wait
 * for it load forever.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Sends the request and reads the body within REQUEST_TIMEOUT_MS (or until the caller aborts). */
async function send(request: PlexRequest): Promise<string> {
  const path = withParams(request.path, request.params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (request.signal?.aborted) abort();
  request.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${request.baseUrl}${path}`, {
      method: request.method ?? 'GET',
      headers: request.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new PlexHttpError(response.status, request.path);
    return await response.text();
  } catch (error) {
    // The caller's own cancel and HTTP errors are answers; anything else means nobody answered.
    if (error instanceof PlexHttpError || request.signal?.aborted) throw error;
    throw new PlexUnreachableError(request.path);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', abort);
  }
}

export async function plexJson<T>(request: PlexRequest): Promise<T> {
  const text = await send(request);
  return (text ? JSON.parse(text) : {}) as T;
}

/** For calls whose answer Vela ignores (timeline, scrobble, stop). */
export async function plexSend(request: PlexRequest): Promise<void> {
  await send(request);
}
