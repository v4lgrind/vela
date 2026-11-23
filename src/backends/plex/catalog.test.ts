import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Episode, LibraryQuery, ServerConnection } from '@/domain';

import { createPlexCatalog, pickNextEpisode } from './catalog';
import { PlexClient } from './client';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));

const connection: ServerConnection = {
  kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test',
  candidateUrls: [], tokenKey: 'plex:m:u', deviceId: 'client-1',
};
const identity = { product: 'Vela', version: '1', deviceName: 'Phone', platform: 'Android' };

const sections = fixture('sections');
const movieSection = sections.MediaContainer.Directory.find((d: { type: string }) => d.type === 'movie').key;
const showSection = sections.MediaContainer.Directory.find((d: { type: string }) => d.type === 'show').key;

let routes: Record<string, unknown>;
let requests: URL[];

beforeEach(() => {
  requests = [];
  routes = {
    '/library/sections': sections,
    [`/library/sections/${movieSection}/all`]: fixture('movies-page'),
    [`/library/sections/${movieSection}/genre`]: fixture('movie-genres'),
    [`/library/sections/${showSection}/all`]: fixture('shows-page'),
    '/hubs/home/continueWatching': fixture('hub-continue-watching'),
    '/hubs/home/onDeck': fixture('hub-on-deck'),
    '/hubs/search': fixture('search'),
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    const body = routes[url.pathname] ?? (url.pathname.startsWith('/library/metadata/') ? fixture('movie-detail') : undefined);
    if (body === undefined) return new Response('', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});

afterEach(() => vi.unstubAllGlobals());

const catalog = () => createPlexCatalog(new PlexClient(connection, 'server-token', identity));
const query = (over: Partial<LibraryQuery> = {}): LibraryQuery => ({
  view: 'items', sort: { by: 'title', order: 'asc' }, filter: {}, offset: 50, limit: 25, ...over,
});
const last = () => requests[requests.length - 1];

describe('Plex catalog', () => {
  it('lists only the movie and show libraries (v1 is video only)', async () => {
    const libraries = await catalog().libraries();
    expect(new Set(libraries.map((l) => l.kind))).toEqual(new Set(['movies', 'shows']));
  });

  it('browses a library with type, sort, paging and the server token', async () => {
    const page = await catalog().browse(movieSection, query({ filter: { unplayed: true } }));
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].kind).toBe('movie');
    const params = Object.fromEntries(last().searchParams);
    expect(params).toMatchObject({
      type: '1', sort: 'titleSort:asc', unwatched: '1', 'X-Plex-Container-Start': '50', 'X-Plex-Container-Size': '25',
    });
    const headers = (vi.mocked(fetch).mock.lastCall?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Plex-Token']).toBe('server-token');
  });

  it('browses shows as type 2 and filters by letter through firstCharacter', async () => {
    routes[`/library/sections/${showSection}/firstCharacter/%23`] = fixture('shows-page');
    await catalog().browse(showSection, query({ filter: { letter: '#' }, sort: { by: 'dateAdded', order: 'desc' } }));
    expect(last().pathname).toBe(`/library/sections/${showSection}/firstCharacter/%23`);
    expect(Object.fromEntries(last().searchParams)).toMatchObject({ type: '2', sort: 'addedAt:desc' });
  });

  it('filters genres by their Plex ids', async () => {
    const genres = fixture('movie-genres').MediaContainer.Directory;
    await catalog().browse(movieSection, query({ filter: { genres: [genres[0].title, genres[1].title] } }));
    expect(last().searchParams.get('genre')).toBe(`${genres[0].key},${genres[1].key}`);
    expect(await catalog().browse(movieSection, query({ filter: { genres: ['no such genre'] } }))).toEqual({ items: [], total: 0 });
  });

  it('returns nothing for favourites, which Plex does not have', async () => {
    expect(await catalog().browse(movieSection, query({ filter: { favorites: true } }))).toEqual({ items: [], total: 0 });
  });

  it('loads an item with its markers and chapters', async () => {
    const item = await catalog().item('42');
    expect(item.kind).toBe('movie');
    expect(last().pathname).toBe('/library/metadata/42');
    expect(Object.fromEntries(last().searchParams)).toMatchObject({ includeMarkers: '1', includeChapters: '1' });
  });

  it('fetches several items in one request', async () => {
    await catalog().items(['1', '2', '3']);
    expect(last().pathname).toBe('/library/metadata/1,2,3');
  });

  it('keeps episodes in progress out of Up Next (they are in Continue Watching)', async () => {
    const c = catalog();
    const upNext = await c.upNext(20);
    expect(upNext.every((episode) => episode.kind === 'episode' && !episode.user.resumePositionMs)).toBe(true);
    const resume = await c.resumeItems(20);
    expect(resume.map((i) => i.kind).sort()).toContain('movie');
  });

  it('flattens search hubs and keeps the asked kinds', async () => {
    const results = await catalog().search({ term: 'x', limit: 50 });
    expect(results.length).toBeGreaterThan(0);
    expect(new Set(results.map((r) => r.kind))).toEqual(new Set(['movie', 'series', 'episode']));
    expect(last().searchParams.get('query')).toBe('x');
  });
});

describe('pickNextEpisode', () => {
  const episode = (id: string, user: Partial<Episode['user']> = {}) =>
    ({ id, kind: 'episode', user: { played: false, playCount: 0, favorite: false, ...user } }) as Episode;

  it('resumes the episode in progress', () => {
    expect(pickNextEpisode([episode('1', { played: true }), episode('2'), episode('3', { resumePositionMs: 5 })])?.id).toBe('3');
  });

  it('continues after the last watched episode', () => {
    expect(pickNextEpisode([episode('1'), episode('2', { played: true }), episode('3')])?.id).toBe('3');
  });

  it('starts at the beginning, and ends when all are watched', () => {
    expect(pickNextEpisode([episode('1'), episode('2')])?.id).toBe('1');
    expect(pickNextEpisode([episode('1', { played: true })])).toBeNull();
  });
});
