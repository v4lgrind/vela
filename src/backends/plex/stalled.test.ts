import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerConnection } from '@/domain';

import { createPlexCatalog } from './catalog';
import { PlexClient } from './client';
import { REQUEST_TIMEOUT_MS } from './http';

const connection = {
  kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test', candidateUrls: [], tokenKey: 'k', deviceId: 'c',
} as ServerConnection;
const sections = { MediaContainer: { Directory: [{ key: '1', type: 'movie', title: 'Films' }] } };
const genres = { MediaContainer: { Directory: [{ key: '7', title: 'Drame' }] } };

/** A request on a connection that died with the old network: no answer, no error, until aborted. */
const stalled = (init: RequestInit = {}) => new Promise<Response>((_resolve, reject) => {
  init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
});

let stall: Set<string>;

beforeEach(() => {
  vi.useFakeTimers();
  stall = new Set();
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = new URL(input).pathname;
    if (stall.has(path)) return stalled(init);
    if (path === '/library/sections') return new Response(JSON.stringify(sections));
    if (path === '/library/sections/1/genre') return new Response(JSON.stringify(genres));
    return new Response('', { status: 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const catalog = () => createPlexCatalog(new PlexClient(connection, 'tok', { product: 'Vela', version: '1', deviceName: 'P', platform: 'Android' }));

describe('a request stalled by a network change', () => {
  it('fails after the timeout instead of loading forever, and the next call works', async () => {
    const c = catalog();
    stall.add('/library/sections');
    const first = c.libraries();
    const failed = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await failed;
    stall.clear();
    await expect(c.libraries()).resolves.toHaveLength(1);
  });

  it('does not keep a failed genre list for the rest of the session', async () => {
    const c = catalog();
    stall.add('/library/sections/1/genre');
    const first = c.genres('1');
    const failed = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await failed;
    stall.clear();
    await expect(c.genres('1')).resolves.toEqual(['Drame']);
  });
});
