import { describe, it, expect } from 'vitest';

import type { DownloadedMedia } from '@/services/offlineDatabase';

import {
  downloadedTracks,
  downloadsInLibrary,
  librariesWithDownloads,
  localGenres,
  localLibraryPage,
  type LocalQuery,
} from './offlineLibrary';

function dl(type: DownloadedMedia['type'], item: Record<string, any>, extra: Partial<DownloadedMedia> = {}): DownloadedMedia {
  return {
    itemId: item.Id,
    type,
    name: item.Name,
    filePath: `content://media/${item.Id}`,
    fileSize: 1,
    downloadDate: 0,
    jellyfinItem: { Type: type, ...item },
    ...extra,
  };
}

const query = (over: Partial<LocalQuery> = {}): LocalQuery => ({
  startIndex: 0,
  limit: 50,
  sortBy: 'SortName',
  sortOrder: 'Ascending',
  unplayedOnly: false,
  favoritesOnly: false,
  genres: [],
  nameStartsWith: '',
  seed: 1,
  ...over,
});

const slumb = [{ Id: 'ar1', Name: 'SLUMB' }];
const tracks = [
  dl('Audio', { Id: 't1', Name: 'Adagio', AlbumId: 'al1', Album: 'Plague', AlbumArtists: slumb, ProductionYear: 2025 }),
  dl('Audio', { Id: 't2', Name: 'Lagoon', AlbumId: 'al1', Album: 'Plague', AlbumArtists: slumb, ProductionYear: 2025 }),
  dl('Audio', { Id: 't3', Name: '1825', AlbumId: 'al2', Album: '1825', AlbumArtists: [{ Id: 'ar2', Name: 'NTO' }] }),
];

describe('localLibraryPage', () => {
  it('groups tracks into albums', () => {
    const page = localLibraryPage(tracks, 'albums', 'music', query());
    expect(page.total).toBe(2);
    expect(page.items.map((a) => a.Id)).toEqual(['al2', 'al1']);
    expect(page.items[1]).toMatchObject({ Id: 'al1', Name: 'Plague', Type: 'MusicAlbum', AlbumArtists: slumb, ChildCount: 2 });
  });

  it('groups tracks into artists', () => {
    const page = localLibraryPage(tracks, 'artists', 'music', query());
    expect(page.items).toEqual([
      expect.objectContaining({ Id: 'ar2', Name: 'NTO', Type: 'MusicArtist' }),
      expect.objectContaining({ Id: 'ar1', Name: 'SLUMB', Type: 'MusicArtist' }),
    ]);
  });

  it('skips album and artist grouping for loose tracks', () => {
    const loose = [...tracks, dl('Audio', { Id: 't4', Name: 'Demo' })];
    expect(localLibraryPage(loose, 'songs', 'music', query()).items.map((s) => s.Id)).toContain('t4');
    expect(localLibraryPage(loose, 'albums', 'music', query()).total).toBe(2);
    expect(localLibraryPage(loose, 'artists', 'music', query()).total).toBe(2);
  });

  it('lists series from episodes', () => {
    const episodes = [
      dl('Episode', { Id: 'e1', Name: 'Pilot', SeriesId: 's1', SeriesName: 'MobLand' }, { seriesId: 's1', seriesName: 'MobLand' }),
      dl('Episode', { Id: 'e2', Name: 'Two', SeriesId: 's1', SeriesName: 'MobLand' }, { seriesId: 's1', seriesName: 'MobLand' }),
    ];
    expect(localLibraryPage(episodes, 'items', 'tvshows', query()).items).toEqual([
      expect.objectContaining({ Id: 's1', Name: 'MobLand', Type: 'Series' }),
    ]);
    const meta = { Id: 's1', Name: 'MobLand', Type: 'Series', ProductionYear: 2025 };
    expect(localLibraryPage(episodes, 'items', 'tvshows', query(), (id) => (id === 's1' ? meta : undefined)).items)
      .toEqual([meta]);
  });

  it('lists movies for a movies library', () => {
    const movies = [dl('Movie', { Id: 'm1', Name: 'Hellraiser' }), dl('Movie', { Id: 'm2', Name: 'Dune' })];
    expect(localLibraryPage(movies, 'items', 'movies', query()).items.map((m) => m.Name)).toEqual(['Dune', 'Hellraiser']);
  });

  it('filters favorites, unplayed and genres', () => {
    const movies = [
      dl('Movie', { Id: 'm1', Name: 'A', UserData: { IsFavorite: true, Played: true }, Genres: ['Horror'] }),
      dl('Movie', { Id: 'm2', Name: 'B', UserData: { IsFavorite: false, Played: false }, Genres: ['Drama'] }),
      dl('Movie', { Id: 'm3', Name: 'C', UserData: { IsFavorite: true, Played: false }, Genres: ['Drama', 'Horror'] }),
    ];
    const ids = (q: Partial<LocalQuery>) => localLibraryPage(movies, 'items', 'movies', query(q)).items.map((m) => m.Id);
    expect(ids({ favoritesOnly: true })).toEqual(['m1', 'm3']);
    expect(ids({ unplayedOnly: true })).toEqual(['m2', 'm3']);
    expect(ids({ genres: ['Horror'] })).toEqual(['m1', 'm3']);
  });

  it('filters by first letter', () => {
    const albums = (letter: string) => localLibraryPage(tracks, 'albums', 'music', query({ nameStartsWith: letter })).items.map((a) => a.Name);
    expect(albums('P')).toEqual(['Plague']);
    expect(albums('#')).toEqual(['1825']);
  });

  it('sorts by name and date, both orders', () => {
    const movies = [
      dl('Movie', { Id: 'm1', Name: 'Alpha', SortName: 'zeta', PremiereDate: '2001-01-01', DateCreated: '2024-03-01', CommunityRating: 6, UserData: { PlayCount: 3 } }),
      dl('Movie', { Id: 'm2', Name: 'Beta', PremiereDate: '1999-01-01', DateCreated: '2024-05-01', CommunityRating: 8, UserData: { PlayCount: 1 } }),
    ];
    const ids = (q: Partial<LocalQuery>) => localLibraryPage(movies, 'items', 'movies', query(q)).items.map((m) => m.Id);
    expect(ids({ sortBy: 'SortName' })).toEqual(['m2', 'm1']);
    expect(ids({ sortBy: 'SortName', sortOrder: 'Descending' })).toEqual(['m1', 'm2']);
    expect(ids({ sortBy: 'PremiereDate' })).toEqual(['m2', 'm1']);
    expect(ids({ sortBy: 'DateCreated', sortOrder: 'Descending' })).toEqual(['m2', 'm1']);
    expect(ids({ sortBy: 'CommunityRating' })).toEqual(['m1', 'm2']);
    expect(ids({ sortBy: 'PlayCount' })).toEqual(['m2', 'm1']);
  });

  it('random order is stable across pages', () => {
    const many = Array.from({ length: 8 }, (_, i) => dl('Movie', { Id: `m${i}`, Name: `Movie ${i}` }));
    const ids = (q: Partial<LocalQuery>) => localLibraryPage(many, 'items', 'movies', query({ sortBy: 'Random', ...q })).items.map((m) => m.Id);
    const all = ids({ seed: 7 });
    expect([...ids({ seed: 7, limit: 4 }), ...ids({ seed: 7, startIndex: 4, limit: 4 })]).toEqual(all);
    expect(ids({ seed: 8 })).not.toEqual(all);
    expect([...all].sort()).toEqual(many.map((m) => m.itemId).sort());
  });

  it('pages with startIndex and limit', () => {
    const page = localLibraryPage(tracks, 'songs', 'music', query({ startIndex: 1, limit: 1 }));
    expect(page.total).toBe(3);
    expect(page.items.map((s) => s.Name)).toEqual(['Adagio']);
  });
});

describe('downloadsInLibrary', () => {
  const music = { Id: 'm', CollectionType: 'music' };
  const audiobooks = { Id: 'b', CollectionType: 'music' };
  const films = { Id: 'f', CollectionType: 'movies' };

  it("keeps a library's own downloads", () => {
    const own = dl('Audio', { Id: 't1', Name: 'x' }, { libraryId: 'b' });
    expect(downloadsInLibrary([own], audiobooks, [music, audiobooks])).toEqual([own]);
    expect(downloadsInLibrary([own], music, [music, audiobooks])).toEqual([]);
  });

  it('falls back to the library of the same type', () => {
    const orphan = dl('Audio', { Id: 't1', Name: 'x' });
    expect(downloadsInLibrary([orphan], music, [music, films])).toEqual([orphan]);
    expect(downloadsInLibrary([orphan], films, [music, films])).toEqual([]);
    expect(downloadsInLibrary([orphan], music, [music, audiobooks, films])).toEqual([orphan]);
    expect(downloadsInLibrary([orphan], audiobooks, [music, audiobooks, films])).toEqual([]);
  });
});

describe('librariesWithDownloads', () => {
  it('hides empty libraries', () => {
    const libs = [{ Id: 'm', CollectionType: 'music' }, { Id: 'f', CollectionType: 'movies' }, { Id: 's', CollectionType: 'tvshows' }];
    const downloads = [dl('Movie', { Id: 'x', Name: 'x' }, { libraryId: 'f' }), dl('Audio', { Id: 'y', Name: 'y' })];
    expect(librariesWithDownloads(libs, downloads).map((l) => l.Id)).toEqual(['m', 'f']);
  });
});

describe('helpers', () => {
  it('lists the unique genres, sorted', () => {
    expect(localGenres([{ Genres: ['Rock', 'Jazz'] }, { Genres: ['Jazz'] }, {}])).toEqual(['Jazz', 'Rock']);
  });

  it('returns the downloaded tracks', () => {
    const movie = dl('Movie', { Id: 'm', Name: 'm' });
    expect(downloadedTracks([...tracks, movie]).map((t) => t.Id)).toEqual(['t1', 't2', 't3']);
  });
});
