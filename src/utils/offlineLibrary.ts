import type { Album, Artist, Library, LibraryKind, LibraryQuery, MediaItem, Page, Series, SortField, Track, UserState } from '@/domain';
import type { DownloadedMedia } from '@/services/offlineDatabase';

/**
 * Library pages built from downloaded media, in the shape of the server's
 * `catalog.browse`, so a library page lists downloads the same way online and
 * offline (same `LibraryQuery`, same `Page<MediaItem>`).
 */

export type LocalLibrary = Pick<Library, 'id' | 'kind'>;

const NO_USER_STATE: UserState = { played: false, playCount: 0, favorite: false };

function libraryKindOf(download: DownloadedMedia): LibraryKind {
  if (download.item.kind === 'movie') return 'movies';
  if (download.item.kind === 'episode') return 'shows';
  return 'music';
}

/**
 * Downloads of `library`. A record without its library id (not backfilled
 * yet) goes to the first library of its kind.
 */
export function downloadsInLibrary(downloads: DownloadedMedia[], library: LocalLibrary, libraries: LocalLibrary[]): DownloadedMedia[] {
  return downloads.filter((download) => {
    if (download.libraryId) return download.libraryId === library.id;
    const kind = libraryKindOf(download);
    return libraries.find((lib) => lib.kind === kind)?.id === library.id;
  });
}

export function librariesWithDownloads<T extends LocalLibrary>(libraries: T[], downloads: DownloadedMedia[]): T[] {
  return libraries.filter((library) => downloadsInLibrary(downloads, library, libraries).length > 0);
}

export function downloadedTracks(downloads: DownloadedMedia[]): Track[] {
  return downloads.map((download) => download.item).filter((item): item is Track => item.kind === 'track');
}

export function localGenres(items: MediaItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b));
}

function albumsOf(tracks: Track[]): Album[] {
  const albums = new Map<string, Album>();
  for (const track of tracks) {
    if (!track.albumId) continue;
    const album = albums.get(track.albumId);
    if (album) {
      album.trackCount = (album.trackCount ?? 0) + 1;
      continue;
    }
    albums.set(track.albumId, {
      id: track.albumId,
      kind: 'album',
      title: track.albumTitle || track.title,
      artists: track.albumArtists,
      year: track.year,
      premiereDate: track.premiereDate,
      addedAt: track.addedAt,
      genres: track.genres,
      studios: [],
      images: { poster: track.images.poster },
      user: track.user,
      trackCount: 1,
    });
  }
  return [...albums.values()];
}

function artistsOf(tracks: Track[]): Artist[] {
  const artists = new Map<string, Artist>();
  for (const track of tracks) {
    for (const artist of track.albumArtists) {
      if (!artist.id || artists.has(artist.id)) continue;
      artists.set(artist.id, {
        id: artist.id, kind: 'artist', title: artist.name, genres: track.genres, studios: [], images: {}, user: NO_USER_STATE,
      });
    }
  }
  return [...artists.values()];
}

function seriesOf(downloads: DownloadedMedia[], seriesMeta?: (id: string) => MediaItem | undefined): MediaItem[] {
  const series = new Map<string, MediaItem>();
  for (const { item } of downloads) {
    if (item.kind !== 'episode' || !item.seriesId || series.has(item.seriesId)) continue;
    const fallback: Series = {
      id: item.seriesId, kind: 'series', title: item.seriesTitle, genres: item.genres, studios: [], credits: [],
      images: { poster: item.images.poster, backdrop: item.images.backdrop }, user: item.user,
    };
    series.set(item.seriesId, seriesMeta?.(item.seriesId) ?? fallback);
  }
  return [...series.values()];
}

function itemsOf(downloads: DownloadedMedia[], query: LibraryQuery, kind: LibraryKind, seriesMeta?: (id: string) => MediaItem | undefined): MediaItem[] {
  const tracks = downloadedTracks(downloads);
  switch (query.view) {
    case 'albums': return albumsOf(tracks);
    case 'artists': return artistsOf(tracks);
    case 'tracks': return tracks;
    case 'playlists': return [];
    default:
      return kind === 'shows' ? seriesOf(downloads, seriesMeta) : downloads.map((d) => d.item).filter((item) => item.kind === 'movie');
  }
}

const sortName = (item: MediaItem): string => (item.sortTitle ?? item.title).toLowerCase();

const SORT_KEY: Record<Exclude<SortField, 'random'>, (item: MediaItem) => string | number> = {
  title: sortName,
  releaseDate: (item) => item.premiereDate ?? '',
  dateAdded: (item) => item.addedAt ?? '',
  rating: (item) => item.rating ?? 0,
  playCount: (item) => item.user.playCount,
};

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

function shuffled(items: MediaItem[], seed: number): MediaItem[] {
  const random = seededRandom(seed);
  const out = [...items].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sorted(items: MediaItem[], query: LibraryQuery, seed: number): MediaItem[] {
  if (query.sort.by === 'random') return shuffled(items, seed);
  const keyOf = SORT_KEY[query.sort.by];
  const direction = query.sort.order === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const byKey = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
    return (byKey || sortName(a).localeCompare(sortName(b))) * direction;
  });
}

function matches(item: MediaItem, filter: LibraryQuery['filter']): boolean {
  if (filter.favorites && !item.user.favorite) return false;
  if (filter.unplayed && item.user.played) return false;
  if (filter.genres?.length && !filter.genres.some((genre) => item.genres.includes(genre))) return false;
  if (filter.letter) {
    const first = sortName(item).charAt(0).toUpperCase();
    if (filter.letter === '#' ? /[A-Z]/.test(first) : first !== filter.letter) return false;
  }
  return true;
}

/**
 * One page of downloaded items for a library view. `seed` keeps a random order
 * stable across the pages of one listing.
 */
export function localLibraryPage(
  downloads: DownloadedMedia[],
  kind: LibraryKind,
  query: LibraryQuery,
  seed: number,
  seriesMeta?: (id: string) => MediaItem | undefined,
): Page<MediaItem> {
  const all = sorted(itemsOf(downloads, query, kind, seriesMeta).filter((item) => matches(item, query.filter)), query, seed);
  return { items: all.slice(query.offset, query.offset + query.limit), total: all.length };
}
