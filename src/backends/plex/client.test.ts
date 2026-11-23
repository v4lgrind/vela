import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerConnection } from '@/domain';

import { PlexClient } from './client';
import { PlexHttpError } from './http';

const LAN = 'https://192-168-1-10.abc.plex.direct:32400';
const WAN = 'https://203-0-113-7.abc.plex.direct:32400';
const connection = {
  kind: 'plex', serverId: 'machine-1', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: LAN,
  candidateUrls: [LAN, WAN], tokenKey: 'k', deviceId: 'c',
} as ServerConnection;
const identity = { product: 'Vela', version: '1', deviceName: 'P', platform: 'Android' };

let requests: string[];
let lanAnswers: boolean;

beforeEach(() => {
  requests = [];
  lanAnswers = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(`${url.origin === LAN ? 'LAN' : 'WAN'} ${url.pathname}`);
    // Away from home: the LAN address has no route.
    if (url.origin === LAN && !lanAnswers) throw new TypeError('Failed to fetch');
    if (url.pathname === '/identity') return new Response(JSON.stringify({ MediaContainer: { machineIdentifier: 'machine-1' } }));
    if (url.pathname === '/missing') return new Response('', { status: 404 });
    return new Response(JSON.stringify({ MediaContainer: { size: 1 } }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('PlexClient item requests', () => {
  it('shares one request for the same item asked from several places', async () => {
    lanAnswers = true;
    const client = new PlexClient(connection, 'tok', identity);
    const item = (id: string) => client.get(`/library/metadata/${id}`, { includeMarkers: 1, includeChapters: 1 });
    await Promise.all([item('7'), item('7'), item('7'), item('7')]);
    await item('7');
    await item('8');
    expect(requests).toEqual(['LAN /library/metadata/7', 'LAN /library/metadata/8']);
  });

  it('asks again after a write or once the answer is old', async () => {
    lanAnswers = true;
    vi.useFakeTimers();
    const client = new PlexClient(connection, 'tok', identity);
    await client.get('/library/metadata/7');
    await client.send('GET', '/:/scrobble', { key: '7' });
    await client.get('/library/metadata/7');
    vi.advanceTimersByTime(3001);
    await client.get('/library/metadata/7');
    vi.useRealTimers();
    expect(requests).toEqual(['LAN /library/metadata/7', 'LAN /:/scrobble', 'LAN /library/metadata/7', 'LAN /library/metadata/7']);
  });

  it('does not keep a failed answer', async () => {
    const client = new PlexClient({ ...connection, candidateUrls: [LAN] }, 'tok', identity);
    await expect(client.get('/library/metadata/7')).rejects.toThrow();
    lanAnswers = true;
    await expect(client.get('/library/metadata/7')).resolves.toBeTruthy();
  });
});

describe('PlexClient away from home', () => {
  it('moves to the address that answers, repeats the request and reports the move', async () => {
    const onConnectionChange = vi.fn();
    const client = new PlexClient(connection, 'tok', identity, { onConnectionChange });
    await expect(client.get('/library/sections')).resolves.toEqual({ MediaContainer: { size: 1 } });
    expect(client.baseUrl).toBe(WAN);
    expect(onConnectionChange).toHaveBeenCalledWith({ ...connection, baseUrl: WAN });
    requests = [];
    await client.get('/hubs/home/onDeck');
    expect(requests).toEqual(['WAN /hubs/home/onDeck']);
  });

  it('searches once when several requests fail together', async () => {
    const client = new PlexClient(connection, 'tok', identity);
    await Promise.all([client.get('/a'), client.get('/b'), client.send('GET', '/c')]);
    expect(requests.filter((r) => r.endsWith('/identity'))).toHaveLength(2);
  });

  it('does not move on a server error', async () => {
    lanAnswers = true;
    const client = new PlexClient(connection, 'tok', identity);
    await expect(client.get('/missing')).rejects.toBeInstanceOf(PlexHttpError);
    expect(client.baseUrl).toBe(LAN);
    expect(requests).toEqual(['LAN /missing']);
  });

  it('moves without waiting for the time limit when the address went silent', async () => {
    // Wi-Fi turned off without any event: the LAN request just hangs.
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      requests.push(`${url.origin === LAN ? 'LAN' : 'WAN'} ${url.pathname}`);
      if (url.origin === LAN) {
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      if (url.pathname === '/identity') return new Response(JSON.stringify({ MediaContainer: { machineIdentifier: 'machine-1' } }));
      return new Response(JSON.stringify({ MediaContainer: { size: 1 } }));
    });
    const client = new PlexClient(connection, 'tok', identity);
    const started = Date.now();
    await expect(client.get('/library/sections')).resolves.toEqual({ MediaContainer: { size: 1 } });
    expect(client.baseUrl).toBe(WAN);
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15_000);

  it('keeps a slow address that is still alive', async () => {
    lanAnswers = true;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(`${url.origin === LAN ? 'LAN' : 'WAN'} ${url.pathname}`);
      if (url.pathname === '/identity') return new Response(JSON.stringify({ MediaContainer: { machineIdentifier: 'machine-1' } }));
      await new Promise((resolve) => setTimeout(resolve, 3500));
      return new Response(JSON.stringify({ MediaContainer: { size: 2 } }));
    });
    const client = new PlexClient(connection, 'tok', identity);
    await expect(client.get('/library/sections/1/all')).resolves.toEqual({ MediaContainer: { size: 2 } });
    expect(client.baseUrl).toBe(LAN);
    expect(requests).toEqual(['LAN /library/sections/1/all', 'LAN /identity']);
  }, 15_000);

  it('gives up with the original error when no address answers', async () => {
    vi.mocked(fetch).mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const client = new PlexClient(connection, 'tok', identity);
    await expect(client.get('/library/sections')).rejects.toThrow(/got no answer/);
    expect(client.baseUrl).toBe(LAN);
  });
});
