import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioStreamRequest, ServerConnection } from '@/domain';

import { PlexClient } from './client';
import { createPlexMusic } from './music';

const connection = {
  kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test',
  candidateUrls: [], tokenKey: 'k', deviceId: 'client-1',
} as ServerConnection;
const identity = { product: 'Vela', version: '1', deviceName: 'Phone', platform: 'Android' };

const track = (id: string, extra: Record<string, unknown> = {}) => ({
  ratingKey: id, type: 'track', title: `t${id}`, parentRatingKey: '6', grandparentRatingKey: '5', grandparentTitle: 'Artist',
  Media: [{ id: Number(id) * 10, container: 'mp3', Part: [{ id: Number(id) * 100, key: `/library/parts/${Number(id) * 100}/1/file.mp3`, Stream: [] }] }],
  ...extra,
});
const album = (id: string, year: number) => ({ ratingKey: id, type: 'album', title: `a${id}`, year, parentRatingKey: '5', parentTitle: 'Artist' });
const container = (Metadata: unknown[]) => ({ MediaContainer: { size: Metadata.length, Metadata } });

let routes: Record<string, unknown>;
let requests: URL[];

beforeEach(() => {
  requests = [];
  routes = {
    '/library/metadata/5/children': container([album('61', 2001), album('62', 2019)]),
    '/library/metadata/5/allLeaves': container([track('1'), track('2')]),
    '/library/metadata/6/children': container([track('1'), track('2'), track('3')]),
    '/playlists/9/items': container([track('3'), track('1')]),
    '/library/sections/10/all': container([track('2')]),
    '/library/metadata/1': container([track('1', { Media: [{ id: 10, Part: [{ id: 100, key: '/k', Stream: [{ id: 88, streamType: 4, codec: 'lrc', key: '/library/streams/88' }] }] }] })]),
    '/library/metadata/2': container([track('2')]),
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname === '/library/streams/88') return new Response('[00:01.00]Hello');
    const body = routes[url.pathname];
    return body === undefined ? new Response('', { status: url.pathname === '/:/timeline' ? 200 : 404 }) : new Response(JSON.stringify(body));
  }));
});
afterEach(() => vi.unstubAllGlobals());

const music = () => createPlexMusic(new PlexClient(connection, 'tok', identity));
const request = (over: Partial<AudioStreamRequest> = {}): AudioStreamRequest => ({
  maxBitrate: 140_000_000, directContainers: ['mp3', 'flac', 'm4a|aac'], transcode: { container: 'mp3', codec: 'mp3', protocol: 'http' }, ...over,
});

describe('Plex music', () => {
  it("lists an artist's albums (newest first) and tracks", async () => {
    expect((await music().artistAlbums('5')).map((a) => [a.id, a.kind])).toEqual([['62', 'album'], ['61', 'album']]);
    expect((await music().artistTracks('5')).map((t) => t.id)).toEqual(['1', '2']);
  });

  it('lists album and playlist tracks in server order', async () => {
    expect((await music().albumTracks('6')).map((t) => t.id)).toEqual(['1', '2', '3']);
    expect((await music().playlistTracks('9')).map((t) => t.id)).toEqual(['3', '1']);
  });

  it('random tracks from a library', async () => {
    await music().randomTracks('10', 25);
    const url = requests[requests.length - 1];
    expect(url.pathname).toBe('/library/sections/10/all');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: '10', sort: 'random', 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '25' });
  });

  it('plays the file directly when its container is playable', () => {
    expect(music().streamUrl('1', request(), '/library/parts/100/1/file.mp3')).toBe('https://pms.test/library/parts/100/1/file.mp3?X-Plex-Token=tok');
  });

  it('converts when the container is not playable or a cap is set', () => {
    const notPlayable = new URL(music().streamUrl('1', request({ directContainers: ['mp3'] }), '/library/parts/100/1/file.flac'));
    expect(notPlayable.pathname).toBe('/music/:/transcode/universal/start.mp3');
    expect(Object.fromEntries(notPlayable.searchParams)).toMatchObject({
      path: '/library/metadata/1', protocol: 'http', directPlay: '0', directStream: '1', 'X-Plex-Token': 'tok', 'X-Plex-Client-Profile-Name': 'Generic',
    });
    expect(notPlayable.searchParams.get('X-Plex-Client-Profile-Extra')).toContain('type=musicProfile&context=streaming&protocol=http&container=mp3&audioCodec=mp3');
    const capped = new URL(music().streamUrl('1', request({ maxBitrate: 320_000 }), '/library/parts/100/1/file.mp3'));
    expect(capped.pathname).toBe('/music/:/transcode/universal/start.mp3');
    expect(capped.searchParams.get('musicBitrate')).toBe('320');
  });

  it('streams HLS for the web player', () => {
    const url = new URL(music().streamUrl('1', request({ directContainers: ['mp3'], transcode: { container: 'ts', codec: 'aac', protocol: 'hls' } }), '/library/parts/100/1/file.flac'));
    expect(url.pathname).toBe('/music/:/transcode/universal/start.m3u8');
    expect(url.searchParams.get('protocol')).toBe('hls');
  });

  it('falls back to the universal stream without a streamRef', () => {
    expect(new URL(music().streamUrl('1', request())).pathname).toBe('/music/:/transcode/universal/start.mp3');
  });

  it('lyrics from the lyrics stream, null without one', async () => {
    expect(await music().lyrics('1')).toEqual({ synced: true, lines: [{ startMs: 1000, text: 'Hello' }] });
    expect(await music().lyrics('2')).toBeNull();
  });

  it('reports the timeline for a track', async () => {
    await music().reporter('1').progress({ positionMs: 4200, durationMs: 9000, isPaused: false });
    const url = requests[requests.length - 1];
    expect(url.pathname).toBe('/:/timeline');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ ratingKey: '1', key: '/library/metadata/1', state: 'playing', time: '4200' });
  });
});
