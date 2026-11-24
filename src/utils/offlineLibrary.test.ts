import { describe, it, expect } from 'vitest';

import type { LibraryQuery, MediaItem, UserState } from '@/domain';
import type { DownloadedMedia } from '@/services/offlineDatabase';

import { downloadedTracks, downloadsInLibrary, librariesWithDownloads, localGenres, localLibraryPage } from './offlineLibrary';

const user = (over: Partial<UserState> = {}): UserState => ({ played: false, playCount: 0, favorite: false, ...over });
const base = (id: string, title: string) => ({ id, title, genres: [] as string[], studios: [], images: {}, user: user() });

function dl(item: MediaItem, extra: Partial<DownloadedMedia> = {}): DownloadedMedia {
  const type = ({ movie: 'Movie', episode: 'Episode', track: 'Audio' } as const)[item.kind as 'movie'] ?? 'Movie';
  return { itemId: item.id, type, name: item.title, filePath: `content://media/${item.id}`, fileSize: 1, downloadDate: 0, serverId: 's', markers: [], item, ...extra };
}

const movie = (id: string, title: string, over: Partial<MediaItem> = {}) =>
  dl({ ...base(id, title), kind: 'movie', versions: [], credits: [], ...over } as MediaItem);
const track = (id: string, title: string, over: Record<string, unknown> = {}) =>
  dl({ ...base(id, title), kind: 'track', artists: [], albumArtists: [], versions: [], ...over } as MediaItem);
const episode = (id: string, title: string, seriesId: string, seriesTitle: string) =>
  dl({ ...base(id, title), kind: 'episode', seriesId, seriesTitle, versions: [], credits: [] } as MediaItem, { seriesId, seriesName: seriesTitle });

const query = (over: Partial<LibraryQuery> = {}): LibraryQuery => ({
  view: 'items', sort: { by: 'title', order: 'asc' }, filter: {}, offset: 0, limit: 50, ...over,
});

const slumb = [{ id: 'ar1', name: 'SLUMB' }];
const tracks = [
  track('t1', 'Adagio', { albumId: 'al1', albumTitle: 'Plague', albumArtists: slumb, year: 2025 }),
  track('t2', 'Lagoon', { albumId: 'al1', albumTitle: 'Plague', albumArtists: slumb, year: 2025 }),
  track('t3', '1825', { albumId: 'al2', albumTitle: '1825', albumArtists: [{ id: 'ar2', name: 'NTO' }] }),
];

describe('localLibraryPage', () => {
  it('groups tracks into albums', () => {
    const page = localLibraryPage(tracks, 'music', query({ view: 'albums' }), 1);
    expect(page.total).toBe(2);
    expect(page.items.map((a) => a.id)).toEqual(['al2', 'al1']);
    expect(page.items[1]).toMatchObject({ id: 'al1', title: 'Plague', kind: 'album', artists: slumb, trackCount: 2 });
  });

  it('groups tracks into artists', () => {
    const page = localLibraryPage(tracks, 'music', query({ view: 'artists' }), 1);
    expect(page.items.map((a) => [a.id, a.title, a.kind])).toEqual([['ar2', 'NTO', 'artist'], ['ar1', 'SLUMB', 'artist']]);
  });

  it('skips album and artist grouping for loose tracks', () => {
    const loose = [...tracks, track('t4', 'Demo')];
    expect(localLibraryPage(loose, 'music', query({ view: 'tracks' }), 1).items.map((s) => s.id)).toContain('t4');
    expect(localLibraryPage(loose, 'music', query({ view: 'albums' }), 1).total).toBe(2);
    expect(localLibraryPage(loose, 'music', query({ view: 'artists' }), 1).total).toBe(2);
  });

  it('lists series from episodes, preferring cached series metadata', () => {
    const episodes = [episode('e1', 'Pilot', 's1', 'MobLand'), episode('e2', 'Two', 's1', 'MobLand')];
    expect(localLibraryPage(episodes, 'shows', query(), 1).items).toEqual([
      expect.objectContaining({ id: 's1', title: 'MobLand', kind: 'series' }),
    ]);
    const meta = { ...base('s1', 'MobLand'), kind: 'series', year: 2025, credits: [] } as MediaItem;
    expect(localLibraryPage(episodes, 'shows', query(), 1, (id) => (id === 's1' ? meta : undefined)).items).toEqual([meta]);
  });

  it('lists movies for a movies library', () => {
    const movies = [movie('m1', 'Hellraiser'), movie('m2', 'Dune')];
    expect(localLibraryPage(movies, 'movies', query(), 1).items.map((m) => m.title)).toEqual(['Dune', 'Hellraiser']);
  });

  it('filters favorites, unplayed and genres', () => {
    const movies = [
      movie('m1', 'A', { user: user({ favorite: true, played: true }), genres: ['Horror'] }),
      movie('m2', 'B', { genres: ['Drama'] }),
      movie('m3', 'C', { user: user({ favorite: true }), genres: ['Drama', 'Horror'] }),
    ];
    const ids = (filter: LibraryQuery['filter']) => localLibraryPage(movies, 'movies', query({ filter }), 1).items.map((m) => m.id);
    expect(ids({ favorites: true })).toEqual(['m1', 'm3']);
    expect(ids({ unplayed: true })).toEqual(['m2', 'm3']);
    expect(ids({ genres: ['Horror'] })).toEqual(['m1', 'm3']);
  });

  it('filters by first letter', () => {
    const albums = (letter: string) => localLibraryPage(tracks, 'music', query({ view: 'albums', filter: { letter } }), 1).items.map((a) => a.title);
    expect(albums('P')).toEqual(['Plague']);
    expect(albums('#')).toEqual(['1825']);
  });

  it('sorts by name and date, both orders', () => {
    const movies = [
      movie('m1', 'Alpha', { sortTitle: 'zeta', premiereDate: '2001-01-01', addedAt: '2024-03-01', rating: 6, user: user({ playCount: 3 }) }),
      movie('m2', 'Beta', { premiereDate: '1999-01-01', addedAt: '2024-05-01', rating: 8, user: user({ playCount: 1 }) }),
    ];
    const ids = (by: LibraryQuery['sort']['by'], order: 'asc' | 'desc' = 'asc') =>
      localLibraryPage(movies, 'movies', query({ sort: { by, order } }), 1).items.map((m) => m.id);
    expect(ids('title')).toEqual(['m2', 'm1']);
    expect(ids('title', 'desc')).toEqual(['m1', 'm2']);
    expect(ids('releaseDate')).toEqual(['m2', 'm1']);
    expect(ids('dateAdded', 'desc')).toEqual(['m2', 'm1']);
    expect(ids('rating')).toEqual(['m1', 'm2']);
    expect(ids('playCount')).toEqual(['m2', 'm1']);
  });

  it('random order is stable across pages', () => {
    const many = Array.from({ length: 8 }, (_, i) => movie(`m${i}`, `Movie ${i}`));
    const ids = (seed: number, offset = 0, limit = 50) =>
      localLibraryPage(many, 'movies', query({ sort: { by: 'random', order: 'asc' }, offset, limit }), seed).items.map((m) => m.id);
    const all = ids(7);
    expect([...ids(7, 0, 4), ...ids(7, 4, 4)]).toEqual(all);
    expect(ids(8)).not.toEqual(all);
    expect([...all].sort()).toEqual(many.map((m) => m.itemId).sort());
  });

  it('pages with offset and limit', () => {
    const page = localLibraryPage(tracks, 'music', query({ view: 'tracks', offset: 1, limit: 1 }), 1);
    expect(page.total).toBe(3);
    expect(page.items.map((s) => s.title)).toEqual(['Adagio']);
  });
});

describe('helpers', () => {
  it('lists downloaded tracks and their genres', () => {
    const songs = [track('t1', 'A', { genres: ['Pop', 'Rock'] }), track('t2', 'B', { genres: ['Pop'] }), movie('m1', 'M')];
    expect(downloadedTracks(songs).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(localGenres(downloadedTracks(songs))).toEqual(['Pop', 'Rock']);
  });
});

describe('downloadsInLibrary', () => {
  const music = { id: 'm', kind: 'music' as const };
  const audiobooks = { id: 'b', kind: 'music' as const };
  const films = { id: 'f', kind: 'movies' as const };

  it('uses the recorded library id', () => {
    const own = track('t1', 'A', {});
    own.libraryId = 'b';
    expect(downloadsInLibrary([own], audiobooks, [music, audiobooks])).toEqual([own]);
    expect(downloadsInLibrary([own], music, [music, audiobooks])).toEqual([]);
  });

  it('sends records without a library id to the first library of their kind', () => {
    const orphan = track('t2', 'B', {});
    expect(downloadsInLibrary([orphan], music, [music, films])).toEqual([orphan]);
    expect(downloadsInLibrary([orphan], films, [music, films])).toEqual([]);
    expect(downloadsInLibrary([orphan], audiobooks, [music, audiobooks, films])).toEqual([]);
  });

  it('keeps only libraries holding downloads', () => {
    const libs = [{ id: 'm', kind: 'music' as const }, { id: 'f', kind: 'movies' as const }, { id: 's', kind: 'shows' as const }];
    expect(librariesWithDownloads(libs, [track('t', 'A'), movie('x', 'X')]).map((l) => l.id)).toEqual(['m', 'f']);
  });
});
