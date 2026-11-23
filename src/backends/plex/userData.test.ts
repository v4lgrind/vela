import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerConnection } from '@/domain';

import { PlexClient } from './client';
import { createPlexUserData } from './userData';

const connection = { kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test', candidateUrls: [], tokenKey: 'k', deviceId: 'c' } as ServerConnection;
let requests: URL[];
let lastViewedAt: number | undefined;

beforeEach(() => {
  requests = [];
  lastViewedAt = undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    const body = url.pathname.startsWith('/library/metadata/') ? { MediaContainer: { Metadata: [{ ratingKey: '7', type: 'movie', title: 't', lastViewedAt }] } } : {};
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const userData = () => createPlexUserData(new PlexClient(connection, 'tok', { product: 'Vela', version: '1', deviceName: 'P', platform: 'Android' }));
const calls = () => requests.map((u) => `${u.pathname}?${[...u.searchParams].filter(([k]) => k !== 'X-Plex-Token').map(([k, v]) => `${k}=${v}`).join('&')}`);

describe('Plex user data', () => {
  it('marks played and unplayed', async () => {
    await userData().setPlayed('7', true);
    await userData().setPlayed('7', false);
    expect(calls()).toEqual([
      '/:/scrobble?key=7&identifier=com.plexapp.plugins.library',
      '/:/unscrobble?key=7&identifier=com.plexapp.plugins.library',
    ]);
  });

  it('pushes offline progress unless the server played it later', async () => {
    lastViewedAt = 1000;
    expect(await userData().pushOfflineProgress({ itemId: '7', positionMs: 5000, played: false, lastPlayedAtMs: 999_000 })).toBe('kept');
    expect(await userData().pushOfflineProgress({ itemId: '7', positionMs: 5000.4, played: false, lastPlayedAtMs: 1_000_000 })).toBe('pushed');
    expect(calls().slice(-1)[0]).toBe('/:/progress?key=7&identifier=com.plexapp.plugins.library&time=5000&state=stopped');
    expect(await userData().pushOfflineProgress({ itemId: '7', positionMs: 0, played: true, lastPlayedAtMs: 2_000_000 })).toBe('pushed');
    expect(calls().slice(-1)[0]).toBe('/:/scrobble?key=7&identifier=com.plexapp.plugins.library');
  });
});
