import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryQuery, ServerConnection } from '@/domain';

import movieDetail from './__fixtures__/movie-detail.json';
import resume from './__fixtures__/resume.json';
import userViews from './__fixtures__/user-views.json';

import { createJellyfinBackend } from './index';

const SERVER = 'https://jf.example';
const identity = { product: 'Vela Android', version: '1.0.0', deviceName: 'Android', platform: 'Android' };
const connection: ServerConnection = {
  kind: 'jellyfin', serverId: 'srv', serverName: 'Maison', user: { id: 'u1', name: 'demo' },
  baseUrl: SERVER, candidateUrls: [], tokenKey: 'jellyfin:srv:u1', deviceId: 'dev-1',
};

let requests: { method: string; path: string; params: URLSearchParams }[] = [];
let responses: Record<string, { status?: number; body?: unknown }> = {};

beforeEach(() => {
  requests = [];
  responses = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    requests.push({ method: init?.method ?? 'GET', path: parsed.pathname, params: parsed.searchParams });
    const response = responses[parsed.pathname] ?? { body: { Items: [], TotalRecordCount: 0 } };
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status ?? 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const backend = () => createJellyfinBackend(connection, 'tok', identity);
const query = (overrides: Partial<LibraryQuery> = {}): LibraryQuery => ({
  view: 'items', sort: { by: 'title', order: 'asc' }, filter: {}, offset: 0, limit: 48, ...overrides,
});

describe('Jellyfin backend: catalog', () => {
  it('lists libraries without the playlists view', async () => {
    responses['/UserViews'] = { body: { Items: [...userViews.Items, { Id: 'p', Name: 'Playlists', CollectionType: 'playlists' }] } };
    const libraries = await backend().catalog.libraries();
    expect(libraries.map((l) => l.kind)).toEqual(['movies', 'shows', 'music']);
    expect(requests[0].params.get('userId')).toBe('u1');
  });

  it('translates a library query into Jellyfin parameters', async () => {
    responses['/Items'] = { body: { Items: movieDetail.Items, TotalRecordCount: 24 } };
    const page = await backend().catalog.browse('lib1', query({
      sort: { by: 'dateAdded', order: 'desc' }, filter: { unplayed: true, favorites: true, genres: ['Drame', 'Thriller'], letter: 'B' },
      offset: 48,
    }));
    expect(page.total).toBe(24);
    expect(page.items[0].kind).toBe('movie');
    const params = requests[0].params;
    expect(Object.fromEntries(params)).toMatchObject({
      userId: 'u1', parentId: 'lib1', recursive: 'true', sortBy: 'DateCreated', sortOrder: 'Descending',
      nameStartsWith: 'B', startIndex: '48', limit: '48',
    });
    // Lists are repeated parameters, as the SDK sends them.
    expect(params.getAll('includeItemTypes')).toEqual(['Movie', 'Series', 'MusicAlbum', 'BoxSet']);
    expect(params.getAll('filters')).toEqual(['IsUnplayed', 'IsFavorite']);
    expect(params.getAll('genres')).toEqual(['Drame', 'Thriller']);
  });

  it('uses the album artists endpoint and audio playlists for music views', async () => {
    await backend().catalog.browse('music', query({ view: 'artists' }));
    await backend().catalog.browse('music', query({ view: 'playlists', filter: { genres: ['Pop'] } }));
    expect(requests[0].path).toBe('/Artists/AlbumArtists');
    expect(requests[1].params.get('includeItemTypes')).toBe('Playlist');
    expect(requests[1].params.get('mediaTypes')).toBe('Audio');
    expect(requests[1].params.has('parentId')).toBe(false);
    expect(requests[1].params.has('genres')).toBe(false);
  });

  it('fetches an item with the detail fields', async () => {
    responses['/Items'] = { body: movieDetail };
    const item = await backend().catalog.item(movieDetail.Items[0].Id);
    expect(item.kind).toBe('movie');
    expect(requests[0].params.getAll('fields')).toContain('MediaSources');
    responses['/Items'] = { body: { Items: [] } };
    await expect(backend().catalog.item('missing')).rejects.toThrow('Item not found');
  });

  it('maps the resume list and picks an item library from its ancestors', async () => {
    responses['/UserItems/Resume'] = { body: resume };
    expect((await backend().catalog.resumeItems(12)).map((i) => i.kind)).toEqual(['movie', 'episode', 'movie']);

    responses['/UserViews'] = { body: userViews };
    const music = userViews.Items[2].Id;
    responses['/Items/x/Ancestors'] = { body: [
      { Id: 'album', Type: 'MusicAlbum' }, { Id: 'books', Type: 'CollectionFolder' },
      { Id: music, Type: 'CollectionFolder' }, { Id: 'root', Type: 'UserRootFolder' },
    ] };
    // A known library wins over the first collection folder.
    expect(await backend().catalog.libraryOf('x')).toBe(music);

    responses['/Items/y/Ancestors'] = { body: [{ Id: 'album', Type: 'MusicAlbum' }, { Id: 'books', Type: 'CollectionFolder' }] };
    expect(await backend().catalog.libraryOf('y')).toBe('books');
    responses['/Items/z/Ancestors'] = { body: [{ Id: 'album', Type: 'MusicAlbum' }] };
    expect(await backend().catalog.libraryOf('z')).toBeUndefined();
  });
});

describe('Jellyfin backend: user data, music, images', () => {
  it('marks played and unplayed', async () => {
    await backend().userData.setPlayed('m1', true);
    await backend().userData.setPlayed('m1', false);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /UserPlayedItems/m1', 'DELETE /UserPlayedItems/m1']);
  });

  it('builds the universal audio URL', () => {
    const url = new URL(backend().music.streamUrl('t1', {
      maxBitrate: 140_000_000, directContainers: ['mp3', 'flac'], transcode: { container: 'mp3', codec: 'mp3', protocol: 'http' },
    }));
    expect(url.pathname).toBe('/Audio/t1/universal');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      ApiKey: 'tok', Container: 'mp3,flac', TranscodingProtocol: 'http', MaxStreamingBitrate: '140000000',
    });
  });

  it('reports a track as a direct stream with its own session id', async () => {
    const reporter = backend().music.reporter('t1');
    await reporter.start({ positionMs: 0, isPaused: false, volume: 80 });
    await reporter.stop({ positionMs: 90_500, isPaused: true });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /Sessions/Playing', 'POST /Sessions/Playing/Stopped']);
  });

  it('builds a radio from the Instant Mix of an item', async () => {
    responses['/Items/t1/InstantMix'] = { body: { Items: [
      { Id: 'x1', Type: 'Audio', Name: 'One' }, { Id: 'x2', Type: 'Audio', Name: 'Two' }, { Id: 'al', Type: 'MusicAlbum', Name: 'Album' },
    ] } };
    const tracks = await backend().music.radio('t1', 100);
    expect(tracks.map((t) => [t.id, t.kind])).toEqual([['x1', 'track'], ['x2', 'track']]);
    expect(Object.fromEntries(requests[0].params)).toMatchObject({ userId: 'u1', limit: '100' });
  });

  it('lists the most played tracks of a library', async () => {
    responses['/Items'] = { body: { Items: [{ Id: 'x1', Type: 'Audio', Name: 'One', UserData: { PlayCount: 7, Played: true } }] } };
    const tracks = await backend().music.mostPlayed('lib1', 500);
    expect(tracks.map((t) => [t.id, t.user.playCount])).toEqual([['x1', 7]]);
    expect(Object.fromEntries(requests[0].params)).toMatchObject({
      parentId: 'lib1', recursive: 'true', filters: 'IsPlayed', sortBy: 'PlayCount', sortOrder: 'Descending', limit: '500',
    });
  });

  it('can build a radio', () => {
    expect(backend().capabilities.radio).toBe(true);
  });

  it('returns null lyrics on 404', async () => {
    responses['/Audio/t1/Lyrics'] = { status: 404 };
    expect(await backend().music.lyrics('t1')).toBeNull();
  });

  it('sends the device-bound authorization and builds image URLs', () => {
    expect(backend().authHeaders().Authorization).toContain('DeviceId="dev-1"');
    expect(backend().imageUrl('abc/Primary/t', { width: 100 })).toBe(`${SERVER}/Items/abc/Images/Primary?tag=t&quality=80&maxWidth=100`);
  });
});
