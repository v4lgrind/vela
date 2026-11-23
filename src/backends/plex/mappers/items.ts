import type { Credit, CreditRole, ItemBase, ItemKind, MediaItem, UserState } from '@/domain';

import type { PlexMetadata, PlexTag } from '../types';

import { itemImages } from './images';
import { hasLyricsStream, toMediaVersion } from './streams';

const KIND_BY_TYPE: Record<string, ItemKind> = {
  movie: 'movie',
  show: 'series',
  season: 'season',
  episode: 'episode',
  collection: 'collection',
  artist: 'artist',
  album: 'album',
  track: 'track',
  playlist: 'playlist',
};

/** Containers holding episodes report progress as leaf counts. */
const CONTAINER_TYPES = new Set(['show', 'season']);

const MS_PER_SECOND = 1000;

export function itemKind(type: string): ItemKind {
  return KIND_BY_TYPE[type] ?? 'other';
}

function unixToIso(seconds: number | undefined): string | undefined {
  return seconds === undefined ? undefined : new Date(seconds * MS_PER_SECOND).toISOString();
}

function containerState(item: PlexMetadata): UserState {
  const total = item.leafCount ?? 0;
  const viewed = item.viewedLeafCount ?? 0;
  return {
    played: total > 0 && viewed >= total,
    playCount: 0,
    favorite: false,
    lastPlayedAt: unixToIso(item.lastViewedAt),
    unplayedCount: Math.max(total - viewed, 0),
  };
}

/** Plex has no favourites; `viewOffset` is only present while an item is in progress. */
export function toUserState(item: PlexMetadata): UserState {
  if (CONTAINER_TYPES.has(item.type)) return containerState(item);
  return {
    played: (item.viewCount ?? 0) > 0,
    playCount: item.viewCount ?? 0,
    favorite: false,
    resumePositionMs: item.viewOffset || undefined,
    lastPlayedAt: unixToIso(item.lastViewedAt),
  };
}

function tagsToCredits(tags: PlexTag[] | undefined, role: CreditRole): Credit[] {
  return (tags ?? []).map((tag) => ({
    personId: tag.id === undefined ? undefined : String(tag.id),
    name: tag.tag,
    role,
    character: tag.role,
    image: tag.thumb,
  }));
}

function credits(item: PlexMetadata): Credit[] {
  return [
    ...tagsToCredits(item.Director, 'director'),
    ...tagsToCredits(item.Writer, 'writer'),
    ...tagsToCredits(item.Producer, 'producer'),
    ...tagsToCredits(item.Role, 'actor'),
  ];
}

function toBase(item: PlexMetadata): ItemBase {
  return {
    id: item.ratingKey,
    kind: itemKind(item.type),
    title: item.title,
    sortTitle: item.titleSort,
    originalTitle: item.originalTitle,
    overview: item.summary,
    tagline: item.tagline,
    year: item.year,
    premiereDate: item.originallyAvailableAt,
    rating: item.audienceRating ?? item.rating,
    contentRating: item.contentRating,
    genres: (item.Genre ?? []).map((genre) => genre.tag),
    studios: item.studio ? [item.studio] : [],
    durationMs: item.duration,
    addedAt: unixToIso(item.addedAt),
    images: itemImages(item),
    user: toUserState(item),
    libraryId: item.librarySectionID === undefined ? undefined : String(item.librarySectionID),
  };
}

type Builder = (item: PlexMetadata, base: ItemBase) => MediaItem;

const versions = (item: PlexMetadata) => (item.Media ?? []).map(toMediaVersion);

const BUILDERS: Partial<Record<ItemKind, Builder>> = {
  movie: (item, base) => ({ ...base, kind: 'movie', versions: versions(item), credits: credits(item) }),
  series: (item, base) => ({
    ...base,
    kind: 'series',
    seasonCount: item.childCount,
    episodeCount: item.leafCount,
    credits: credits(item),
  }),
  season: (item, base) => ({
    ...base,
    kind: 'season',
    seriesId: item.parentRatingKey ?? '',
    seriesTitle: item.parentTitle ?? '',
    seasonNumber: item.index,
    episodeCount: item.leafCount,
  }),
  episode: (item, base) => ({
    ...base,
    kind: 'episode',
    seriesId: item.grandparentRatingKey ?? '',
    seriesTitle: item.grandparentTitle ?? '',
    seasonId: item.parentRatingKey,
    seasonTitle: item.parentTitle,
    seasonNumber: item.parentIndex,
    episodeNumber: item.index,
    versions: versions(item),
    credits: credits(item),
  }),
  collection: (item, base) => ({ ...base, kind: 'collection', itemCount: item.childCount }),
  artist: (item, base) => ({ ...base, kind: 'artist', albumCount: item.childCount }),
  album: (item, base) => ({
    ...base,
    kind: 'album',
    artists: [{ id: item.parentRatingKey, name: item.parentTitle ?? '' }],
    trackCount: item.leafCount,
  }),
  track: (item, base) => ({
    ...base,
    kind: 'track',
    albumId: item.parentRatingKey,
    albumTitle: item.parentTitle,
    artists: [{ id: item.grandparentRatingKey, name: item.originalTitle ?? item.grandparentTitle ?? '' }],
    albumArtist: item.grandparentTitle,
    albumArtists: item.grandparentRatingKey ? [{ id: item.grandparentRatingKey, name: item.grandparentTitle ?? '' }] : [],
    trackNumber: item.index,
    discNumber: item.parentIndex,
    hasLyrics: hasLyricsStream(item.Media),
    versions: versions(item),
  }),
  playlist: (item, base) => ({
    ...base,
    kind: 'playlist',
    mediaType: item.playlistType === 'audio' || item.playlistType === 'video' ? item.playlistType : 'mixed',
    itemCount: item.leafCount,
  }),
};

export function toMediaItem(item: PlexMetadata): MediaItem {
  const base = toBase(item);
  const build = BUILDERS[base.kind];
  return build ? build(item, base) : { ...base, kind: 'other' };
}
