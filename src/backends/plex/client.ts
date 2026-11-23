import type { BackendEvents, ClientIdentity, ServerConnection } from '@/domain';

import { raceConnections, savedConnections } from './connect';
import { PlexUnreachableError, plexHeaders, plexJson, plexSend, plexText, withParams } from './http';
import type { PlexContainer, PlexMetadata } from './types';

export type Params = Record<string, string | number | boolean | undefined>;

/**
 * One item page asks for the same item from several places at once (route
 * guard, page, playback negotiation, markers, chapters, next episode): they
 * share one request, and its answer for this long. Any write clears it.
 */
export const ITEM_CACHE_MS = 3000;
const isItemPath = (path: string) => path.startsWith('/library/metadata/');
/**
 * A request without an answer after this long makes the client check its
 * address: after a silent network change (Wi-Fi off) it would otherwise wait
 * for the full request time limit before moving.
 */
export const SLOW_REQUEST_MS = 3000;
const ALIVE_CHECK_MS = 2000;

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
  private readonly items = new Map<string, { answer: Promise<unknown>; at: number }>();

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
    const load = () => this.withFailover((baseUrl, signal) => plexJson<T>({ baseUrl, path, params: { ...params, ...paging }, headers: this.headers, signal }));
    return isItemPath(path) && !window ? this.shared(withParams(path, params), load) : load();
  }

  private shared<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.items.get(key);
    if (cached && Date.now() - cached.at < ITEM_CACHE_MS) return cached.answer as Promise<T>;
    const answer = load();
    this.items.set(key, { answer, at: Date.now() });
    answer.catch(() => {
      if (this.items.get(key)?.answer === answer) this.items.delete(key);
    });
    return answer;
  }

  async metadata(path: string, params: Params = {}, window?: Window): Promise<PlexMetadata[]> {
    return (await this.get(path, params, window)).MediaContainer.Metadata ?? [];
  }

  /** Writes (watched state, timeline, transcode stop) may change items: shared answers are dropped. */
  send(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params: Params = {}): Promise<void> {
    this.items.clear();
    return this.withFailover((baseUrl, signal) => plexSend({ baseUrl, path, method, params, headers: this.headers, signal }));
  }

  text(path: string): Promise<string> {
    return this.withFailover((baseUrl, signal) => plexText({ baseUrl, path, headers: this.headers, signal }));
  }

  /** Absolute URL carrying the token, for players and `<img>` that cannot send headers. */
  url(path: string, params: Params = {}): string {
    return `${this.baseUrl}${withParams(path, { ...params, 'X-Plex-Token': this.token })}`;
  }

  private async withFailover<T>(request: (baseUrl: string, signal?: AbortSignal) => Promise<T>): Promise<T> {
    const tried = this.baseUrl;
    const controller = new AbortController();
    let movedTo: string | null = null;
    const watchdog = setTimeout(() => {
      this.moveIfDead(tried).then((next) => {
        if (next) {
          movedTo = next;
          controller.abort();
        }
      });
    }, SLOW_REQUEST_MS);
    try {
      return await request(tried, controller.signal);
    } catch (error) {
      if (movedTo) return request(movedTo);
      if (!(error instanceof PlexUnreachableError)) throw error;
      const next = this.baseUrl !== tried ? this.baseUrl : await this.relocate().catch(() => null);
      if (!next || next === tried) throw error;
      return request(next);
    } finally {
      clearTimeout(watchdog);
    }
  }

  /**
   * A slow request: is its address still there? A live address is kept even if
   * slow (moving from the LAN to the public address would send the stream
   * through the router); a dead one is replaced. Resolves to the new address.
   */
  private async moveIfDead(address: string): Promise<string | null> {
    if (this.baseUrl !== address) return this.baseUrl;
    const isAlive = await plexJson({ baseUrl: address, path: '/identity', headers: this.headers, signal: AbortSignal.timeout(ALIVE_CHECK_MS) })
      .then(() => true, () => false);
    if (isAlive) return null;
    const next = await this.relocate().catch(() => null);
    return next && next !== address ? next : null;
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
