import type { DownloadedMedia } from '@/services/offlineDatabase';

/**
 * Library pages built from downloaded media, in the `{ items, total }` shape
 * of the server fetchers, so a library page can list downloads the same way
 * online and offline.
 */

/** `items`: the grid of a video library (movies, or series for tvshows). */
export type LocalView = 'albums' | 'artists' | 'songs' | 'items';

export interface LocalQuery {
  startIndex: number;
  limit: number;
  sortBy: string;
  sortOrder: 'Ascending' | 'Descending';
  unplayedOnly: boolean;
  favoritesOnly: boolean;
  genres: string[];
  nameStartsWith: string;
  /** Seeds the Random sort, so every page of one listing shares its order. */
  seed: number;
}

export interface LocalLibrary {
  Id?: string | null;
  CollectionType?: string | null;
}

function collectionTypeOf(download: DownloadedMedia): string {
  if (download.type === 'Movie') return 'movies';
  if (download.type === 'Episode') return 'tvshows';
  return 'music';
}

/**
 * Downloads of `library`. A record without its library id (not backfilled
 * yet) goes to the first library of its collection type.
 */
export function downloadsInLibrary(
  downloads: DownloadedMedia[],
  library: LocalLibrary,
  libraries: LocalLibrary[],
): DownloadedMedia[] {
  return downloads.filter((download) => {
    if (download.libraryId) return download.libraryId === library.Id;
    const type = collectionTypeOf(download);
    return libraries.find((lib) => lib.CollectionType === type)?.Id === library.Id;
  });
}

export function librariesWithDownloads<T extends LocalLibrary>(libraries: T[], downloads: DownloadedMedia[]): T[] {
  return libraries.filter((library) => downloadsInLibrary(downloads, library, libraries).length > 0);
}

export function downloadedTracks(downloads: DownloadedMedia[]): any[] {
  return downloads.filter((download) => download.type === 'Audio').map((download) => download.jellyfinItem);
}

export function localGenres(items: any[]): string[] {
  return [...new Set(items.flatMap((item) => item.Genres ?? []))].sort((a, b) => a.localeCompare(b));
}

function albumsOf(tracks: any[]): any[] {
  const albums = new Map<string, any>();
  for (const track of tracks) {
    if (!track.AlbumId) continue;
    const album = albums.get(track.AlbumId);
    if (album) {
      album.ChildCount++;
      continue;
    }
    albums.set(track.AlbumId, {
      Id: track.AlbumId,
      Name: track.Album || track.Name,
      Type: 'MusicAlbum',
      AlbumArtist: track.AlbumArtist,
      AlbumArtists: track.AlbumArtists ?? [],
      ProductionYear: track.ProductionYear,
      PremiereDate: track.PremiereDate,
      DateCreated: track.DateCreated,
      Genres: track.Genres,
      UserData: track.UserData,
      ChildCount: 1,
    });
  }
  return [...albums.values()];
}

function artistsOf(tracks: any[]): any[] {
  const artists = new Map<string, any>();
  for (const track of tracks) {
    for (const artist of track.AlbumArtists ?? []) {
      if (!artist.Id || artists.has(artist.Id)) continue;
      artists.set(artist.Id, { Id: artist.Id, Name: artist.Name, Type: 'MusicArtist', Genres: track.Genres });
    }
  }
  return [...artists.values()];
}

function seriesOf(episodes: DownloadedMedia[], seriesMeta?: (id: string) => any | undefined): any[] {
  const series = new Map<string, any>();
  for (const episode of episodes) {
    if (!episode.seriesId || series.has(episode.seriesId)) continue;
    series.set(episode.seriesId, seriesMeta?.(episode.seriesId) ?? {
      Id: episode.seriesId,
      Name: episode.seriesName || episode.jellyfinItem?.SeriesName || '',
      Type: 'Series',
      Genres: episode.jellyfinItem?.Genres,
      UserData: episode.jellyfinItem?.UserData,
    });
  }
  return [...series.values()];
}

function itemsOf(
  downloads: DownloadedMedia[],
  view: LocalView,
  collectionType: string | null | undefined,
  seriesMeta?: (id: string) => any | undefined,
): any[] {
  const tracks = downloadedTracks(downloads);
  switch (view) {
    case 'albums': return albumsOf(tracks);
    case 'artists': return artistsOf(tracks);
    case 'songs': return tracks;
    default:
      return collectionType === 'tvshows'
        ? seriesOf(downloads.filter((d) => d.type === 'Episode'), seriesMeta)
        : downloads.filter((d) => d.type === 'Movie').map((d) => d.jellyfinItem);
  }
}

const sortName = (item: any): string => String(item.SortName ?? item.Name ?? '').toLowerCase();

function sortKey(item: any, sortBy: string): string | number {
  switch (sortBy) {
    case 'PremiereDate': return item.PremiereDate ?? '';
    case 'DateCreated': return item.DateCreated ?? '';
    case 'CommunityRating': return item.CommunityRating ?? 0;
    case 'PlayCount': return item.UserData?.PlayCount ?? 0;
    default: return sortName(item);
  }
}

/** mulberry32: a small seeded PRNG. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sorted(items: any[], query: LocalQuery): any[] {
  if (query.sortBy === 'Random') {
    const random = seededRandom(query.seed);
    const out = [...items].sort((a, b) => String(a.Id).localeCompare(String(b.Id)));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const direction = query.sortOrder === 'Descending' ? -1 : 1;
  return [...items].sort((a, b) => {
    const ka = sortKey(a, query.sortBy);
    const kb = sortKey(b, query.sortBy);
    const byKey = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
    return (byKey || sortName(a).localeCompare(sortName(b))) * direction;
  });
}

function matches(item: any, query: LocalQuery): boolean {
  if (query.favoritesOnly && !item.UserData?.IsFavorite) return false;
  if (query.unplayedOnly && item.UserData?.Played) return false;
  if (query.genres.length && !query.genres.some((genre) => item.Genres?.includes(genre))) return false;
  if (query.nameStartsWith) {
    const first = sortName(item).charAt(0).toUpperCase();
    if (query.nameStartsWith === '#' ? /[A-Z]/.test(first) : first !== query.nameStartsWith) return false;
  }
  return true;
}

export function localLibraryPage(
  downloads: DownloadedMedia[],
  view: LocalView,
  collectionType: string | null | undefined,
  query: LocalQuery,
  seriesMeta?: (id: string) => any | undefined,
): { items: any[]; total: number } {
  const all = sorted(itemsOf(downloads, view, collectionType, seriesMeta).filter((item) => matches(item, query)), query);
  return { items: all.slice(query.startIndex, query.startIndex + query.limit), total: all.length };
}
