import type {
  CatalogPort,
  Episode,
  ItemKind,
  Library,
  LibraryQuery,
  LibraryView,
  MediaItem,
  Page,
  Person,
  Season,
  SortField,
} from '@/domain';

import type { Params, PlexClient } from './client';
import { toLibrary, toMediaItem, toPerson } from './mappers';
import type { PlexDirectory, PlexMetadata, PlexTag } from './types';

/** Plex `type=` numbers. */
const PLEX_TYPE = { movie: 1, show: 2, season: 3, episode: 4, artist: 8, album: 9, track: 10 } as const;

const SORT_FIELD: Record<Exclude<SortField, 'random'>, string> = {
  title: 'titleSort',
  releaseDate: 'originallyAvailableAt',
  dateAdded: 'addedAt',
  rating: 'audienceRating',
  playCount: 'viewCount',
};

const TYPE_BY_VIEW: Partial<Record<LibraryView, number>> = {
  artists: PLEX_TYPE.artist,
  albums: PLEX_TYPE.album,
  tracks: PLEX_TYPE.track,
};

/** Libraries Vela lists for Plex. */
const LISTED_SECTIONS = new Set(['movie', 'show', 'artist']);
const VIDEO_SECTIONS = new Set(['movie', 'show']);
const SEARCH_KINDS: ItemKind[] = ['movie', 'series', 'episode'];
const BATCH_SIZE = 100;
const DETAIL = { includeMarkers: 1, includeChapters: 1 };

function sortParam(query: LibraryQuery): string {
  if (query.sort.by === 'random') return 'random';
  return `${SORT_FIELD[query.sort.by]}:${query.sort.order}`;
}

function toItems<T extends MediaItem = MediaItem>(metadata: PlexMetadata[]): T[] {
  return metadata.map(toMediaItem) as T[];
}

/** In progress first, else the first unwatched after the last watched one. */
export function pickNextEpisode(episodes: Episode[]): Episode | null {
  const inProgress = episodes.find((episode) => episode.user.resumePositionMs && !episode.user.played);
  if (inProgress) return inProgress;
  const lastWatched = episodes.map((episode) => episode.user.played).lastIndexOf(true);
  return episodes.slice(lastWatched + 1).find((episode) => !episode.user.played) ?? null;
}

export function createPlexCatalog(client: PlexClient): CatalogPort {
  let sections: Promise<PlexDirectory[]> | null = null;
  const genreIds = new Map<string, Promise<Map<string, string>>>();

  function allSections(): Promise<PlexDirectory[]> {
    sections ??= client.get('/library/sections').then((c) => c.MediaContainer.Directory ?? []).catch((error) => {
      sections = null;
      throw error;
    });
    return sections;
  }

  const videoSections = async () => (await allSections()).filter((section) => VIDEO_SECTIONS.has(section.type));
  const sectionType = async (id: string) => (await allSections()).find((section) => section.key === id)?.type;

  function genresOf(libraryId: string): Promise<Map<string, string>> {
    let ids = genreIds.get(libraryId);
    if (!ids) {
      ids = client.get(`/library/sections/${libraryId}/genre`)
        .then((c) => new Map((c.MediaContainer.Directory ?? []).map((genre) => [genre.title, genre.key])))
        .catch((error) => {
          genreIds.delete(libraryId);
          throw error;
        });
      genreIds.set(libraryId, ids);
    }
    return ids;
  }

  async function itemType(libraryId: string, view: LibraryView): Promise<number> {
    const byView = TYPE_BY_VIEW[view];
    if (byView) return byView;
    return (await sectionType(libraryId)) === 'show' ? PLEX_TYPE.show : PLEX_TYPE.movie;
  }

  async function browse(libraryId: string, query: LibraryQuery): Promise<Page<MediaItem>> {
    // Plex has no favourites (capabilities.favorites is off).
    if (query.filter.favorites) return { items: [], total: 0 };
    if (query.view === 'playlists') {
      const page = await client.get('/playlists', { playlistType: 'audio' }, query);
      return { items: toItems(page.MediaContainer.Metadata ?? []), total: page.MediaContainer.totalSize ?? page.MediaContainer.size ?? 0 };
    }
    const params: Params = { type: await itemType(libraryId, query.view), sort: sortParam(query) };
    if (query.filter.unplayed) params.unwatched = 1;
    if (query.filter.genres?.length) {
      const ids = await genresOf(libraryId);
      const wanted = query.filter.genres.map((name) => ids.get(name)).filter(Boolean);
      if (!wanted.length) return { items: [], total: 0 };
      params.genre = wanted.join(',');
    }
    const letter = query.filter.letter;
    const path = letter
      ? `/library/sections/${libraryId}/firstCharacter/${encodeURIComponent(letter)}`
      : `/library/sections/${libraryId}/all`;
    const page = await client.get(path, params, query);
    const items = toItems(page.MediaContainer.Metadata ?? []);
    return { items, total: page.MediaContainer.totalSize ?? page.MediaContainer.size ?? items.length };
  }

  async function item(id: string): Promise<MediaItem> {
    const [found] = await client.metadata(`/library/metadata/${id}`, DETAIL);
    if (!found) throw new Error(`Item not found: ${id}`);
    return toMediaItem(found);
  }

  async function items(ids: string[]): Promise<MediaItem[]> {
    const result: MediaItem[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE).map(encodeURIComponent).join(',');
      if (batch) result.push(...toItems(await client.metadata(`/library/metadata/${batch}`)));
    }
    return result;
  }

  async function latest(libraryId: string, limit: number): Promise<MediaItem[]> {
    const isShows = (await sectionType(libraryId)) === 'show';
    const params = isShows ? { type: PLEX_TYPE.show, sort: 'episode.addedAt:desc' } : { type: PLEX_TYPE.movie, sort: 'addedAt:desc' };
    return toItems(await client.metadata(`/library/sections/${libraryId}/all`, params, { offset: 0, limit }));
  }

  async function search(query: { term: string; kinds?: ItemKind[]; limit?: number }): Promise<MediaItem[]> {
    const kinds = query.kinds ?? SEARCH_KINDS;
    const limit = query.limit ?? 20;
    const hubs = (await client.get('/hubs/search', { query: query.term, limit })).MediaContainer.Hub ?? [];
    const found = toItems(hubs.flatMap((hub) => hub.Metadata ?? [])).filter((result) => kinds.includes(result.kind));
    return found.slice(0, limit);
  }

  async function person(id: string): Promise<Person | null> {
    const directory = (await client.get(`/library/people/${encodeURIComponent(id)}`)).MediaContainer.Directory ?? [];
    const tag = directory[0] as unknown as PlexTag | undefined;
    return tag ? toPerson(tag) : null;
  }

  async function filmography(personId: string): Promise<MediaItem[]> {
    const lists = await Promise.all((await videoSections()).map((section) => client.metadata(`/library/sections/${section.key}/all`, {
      type: section.type === 'show' ? PLEX_TYPE.show : PLEX_TYPE.movie, actor: personId, sort: 'originallyAvailableAt:desc',
    })));
    return toItems(lists.flat()).sort((a, b) => (b.premiereDate ?? '').localeCompare(a.premiereDate ?? ''));
  }

  async function seriesEpisodes(seriesId: string): Promise<Episode[]> {
    return toItems<Episode>(await client.metadata(`/library/metadata/${seriesId}/allLeaves`));
  }

  return {
    libraries: async (): Promise<Library[]> => (await allSections()).filter((section) => LISTED_SECTIONS.has(section.type)).map(toLibrary),
    browse,
    genres: async (libraryId) => [...(await genresOf(libraryId)).keys()].sort((a, b) => a.localeCompare(b)),
    item,
    items,
    libraryOf: async (id) => {
      const [found] = await client.metadata(`/library/metadata/${id}`);
      return found?.librarySectionID === undefined ? undefined : String(found.librarySectionID);
    },
    resumeItems: async (limit) => toItems(await client.metadata('/hubs/home/continueWatching', { count: limit }))
      .filter((found) => found.kind === 'movie' || found.kind === 'episode')
      .slice(0, limit),
    // On Deck also lists episodes in progress; those belong to resumeItems.
    upNext: async (limit) => toItems<Episode>(await client.metadata('/hubs/home/onDeck', { count: limit }))
      .filter((found) => found.kind === 'episode' && !found.user.resumePositionMs)
      .slice(0, limit),
    nextEpisode: async (seriesId) => pickNextEpisode(await seriesEpisodes(seriesId)),
    latest,
    seasons: async (seriesId) => toItems<Season>(await client.metadata(`/library/metadata/${seriesId}/children`))
      .filter((found) => found.kind === 'season'),
    episodes: async (seasonId) => toItems<Episode>(await client.metadata(`/library/metadata/${seasonId}/children`))
      .filter((found) => found.kind === 'episode'),
    seriesEpisodes,
    search,
    similar: async (id, limit = 12) => toItems(await client.metadata(`/library/metadata/${id}/similar`, { count: limit })).slice(0, limit),
    person,
    filmography,
  };
}
