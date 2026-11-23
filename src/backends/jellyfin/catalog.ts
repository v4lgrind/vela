import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

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

import type { JellyfinClient, Query } from './client';
import { toLibrary, toMediaItem } from './mappers';

interface ItemsPage {
  Items?: BaseItemDto[];
  TotalRecordCount?: number;
}

const BROWSABLE_TYPES = ['Movie', 'Series', 'MusicAlbum', 'BoxSet'];
const DETAIL_FIELDS = ['MediaStreams', 'UserData', 'People', 'Overview', 'Genres', 'Studios', 'MediaSources', 'Trickplay'];
const EPISODE_FIELDS = ['Overview', 'PrimaryImageAspectRatio', 'CommunityRating', 'PremiereDate', 'UserData', 'MediaStreams', 'MediaSources'];
const HOME_IMAGES = { enableImageTypes: ['Primary', 'Backdrop', 'Thumb'], imageTypeLimit: 1 };
const BATCH_SIZE = 100;

const SORT_BY: Record<SortField, string> = {
  title: 'SortName',
  releaseDate: 'PremiereDate',
  dateAdded: 'DateCreated',
  rating: 'CommunityRating',
  playCount: 'PlayCount',
  random: 'Random',
};

const TYPES_BY_VIEW: Partial<Record<LibraryView, string[]>> = {
  items: BROWSABLE_TYPES,
  albums: ['MusicAlbum'],
  tracks: ['Audio'],
};

const TYPE_BY_KIND: Partial<Record<ItemKind, string>> = {
  movie: 'Movie',
  series: 'Series',
  season: 'Season',
  episode: 'Episode',
  collection: 'BoxSet',
  artist: 'MusicArtist',
  album: 'MusicAlbum',
  track: 'Audio',
  playlist: 'Playlist',
  person: 'Person',
};

function toPage(page: ItemsPage): Page<MediaItem> {
  const items = (page.Items ?? []).map(toMediaItem);
  return { items, total: page.TotalRecordCount ?? items.length };
}

function mapItems<T extends MediaItem>(page: ItemsPage | BaseItemDto[]): T[] {
  const items = Array.isArray(page) ? page : page.Items ?? [];
  return items.map(toMediaItem) as T[];
}

function queryFilters(query: LibraryQuery): Query {
  const filters = [query.filter.unplayed && 'IsUnplayed', query.filter.favorites && 'IsFavorite'].filter(Boolean) as string[];
  return {
    filters,
    genres: query.filter.genres,
    nameStartsWith: query.filter.letter,
    sortBy: [SORT_BY[query.sort.by]],
    sortOrder: [query.sort.order === 'asc' ? 'Ascending' : 'Descending'],
    startIndex: query.offset,
    limit: query.limit,
  };
}

/** Same rule as before the migration: a known library among the ancestors, else the collection folder. */
function pickLibraryId(ancestors: BaseItemDto[], libraryIds: string[]): string | undefined {
  const known = ancestors.find((ancestor) => ancestor.Id && libraryIds.includes(ancestor.Id));
  return (known ?? ancestors.find((ancestor) => ancestor.Type === 'CollectionFolder'))?.Id ?? undefined;
}

export function createJellyfinCatalog(client: JellyfinClient): CatalogPort {
  const userId = client.userId;
  const items = (query: Query) => client.get<ItemsPage>('/Items', { userId, ...query });

  async function libraries(): Promise<Library[]> {
    const views = await client.get<ItemsPage>('/UserViews', { userId });
    return (views.Items ?? []).filter((view) => view.CollectionType !== 'playlists').map(toLibrary);
  }

  async function browse(libraryId: string, query: LibraryQuery): Promise<Page<MediaItem>> {
    const common = queryFilters(query);
    if (query.view === 'artists') {
      return toPage(await client.get('/Artists/AlbumArtists', { userId, parentId: libraryId, enableUserData: true, ...common }));
    }
    if (query.view === 'playlists') {
      return toPage(await items({ recursive: true, includeItemTypes: ['Playlist'], mediaTypes: ['Audio'], ...common, filters: undefined, genres: undefined }));
    }
    return toPage(await items({ parentId: libraryId, recursive: true, includeItemTypes: TYPES_BY_VIEW[query.view], ...common }));
  }

  async function genres(libraryId: string): Promise<string[]> {
    const page = await items({ parentId: libraryId, recursive: true, includeItemTypes: BROWSABLE_TYPES, fields: ['Genres'], limit: 1000 });
    return [...new Set((page.Items ?? []).flatMap((item) => item.Genres ?? []))].sort();
  }

  async function item(id: string): Promise<MediaItem> {
    const page = await items({ ids: [id], fields: DETAIL_FIELDS, enableUserData: true });
    const found = page.Items?.[0];
    if (!found) throw new Error(`Item not found: ${id}`);
    return toMediaItem(found);
  }

  async function itemsByIds(ids: string[]): Promise<MediaItem[]> {
    const result: MediaItem[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      result.push(...mapItems(await items({ ids: ids.slice(i, i + BATCH_SIZE), recursive: true, enableUserData: true })));
    }
    return result;
  }

  async function libraryOf(id: string): Promise<string | undefined> {
    const [ancestors, known] = await Promise.all([client.get<BaseItemDto[]>(`/Items/${id}/Ancestors`, { userId }), libraries()]);
    return pickLibraryId(ancestors ?? [], known.map((library) => library.id));
  }

  return {
    libraries,
    browse,
    genres,
    item,
    items: itemsByIds,
    libraryOf,
    resumeItems: async (limit) => mapItems(await client.get('/UserItems/Resume', {
      userId, limit, fields: ['Overview', 'UserData', 'SeriesInfo', 'ParentId'], includeItemTypes: ['Movie', 'Episode'], ...HOME_IMAGES,
    })),
    upNext: async (limit) => mapItems<Episode>(await client.get('/Shows/NextUp', {
      userId, limit, fields: ['PrimaryImageAspectRatio', 'SeriesInfo', 'ParentId', 'UserData'], ...HOME_IMAGES,
    })),
    nextEpisode: async (seriesId) => mapItems<Episode>(await client.get('/Shows/NextUp', { userId, seriesId, limit: 1 }))[0] ?? null,
    latest: async (libraryId, limit) => mapItems(await client.get<BaseItemDto[]>('/Items/Latest', {
      userId, parentId: libraryId, limit, fields: ['PrimaryImageAspectRatio', 'Overview', 'ProductionYear'], ...HOME_IMAGES,
    })),
    seasons: async (seriesId) => mapItems<Season>(await items({
      parentId: seriesId, includeItemTypes: ['Season'], sortBy: ['SortName'], sortOrder: ['Ascending'],
    })),
    episodes: async (seasonId) => mapItems<Episode>(await items({
      parentId: seasonId, includeItemTypes: ['Episode'], sortBy: ['SortName'], sortOrder: ['Ascending'], fields: EPISODE_FIELDS,
    })),
    seriesEpisodes: async (seriesId) => mapItems<Episode>(await items({
      seriesId, includeItemTypes: ['Episode'], sortBy: ['ParentIndexNumber', 'IndexNumber'], sortOrder: ['Ascending'],
      fields: ['Overview', 'UserData', 'MediaSources'], recursive: true,
    })),
    search: async (query) => mapItems(await items({
      searchTerm: query.term, recursive: true, sortBy: ['SortName'], sortOrder: ['Ascending'], limit: query.limit ?? 20,
      includeItemTypes: (query.kinds ?? ['movie', 'series', 'episode']).map((kind) => TYPE_BY_KIND[kind]).filter(Boolean) as string[],
    })),
    similar: async (id, limit = 12) => mapItems(await client.get(`/Items/${id}/Similar`, { userId, limit, fields: ['Overview'] })),
    person: async (id) => (mapItems<Person>(await items({ ids: [id], fields: ['Overview', 'PrimaryImageAspectRatio'] }))[0] ?? null),
    filmography: async (personId) => mapItems(await items({
      personIds: [personId], includeItemTypes: ['Movie', 'Series'], sortBy: ['PremiereDate'], sortOrder: ['Descending'],
      fields: ['Overview', 'UserData'], enableUserData: true, recursive: true,
    })),
  };
}
