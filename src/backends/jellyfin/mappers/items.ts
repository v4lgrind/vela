import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemPerson } from '@jellyfin/sdk/lib/generated-client/models/base-item-person';
import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';

import type { ArtistRef, Credit, CreditRole, ItemBase, ItemKind, MediaItem, UserState } from '@/domain';

import { list, opt, ticksToMs } from './common';
import { itemImages, jellyfinImageRef } from './images';
import { toMediaVersions } from './streams';

const KIND_BY_TYPE: Record<string, ItemKind> = {
  Movie: 'movie',
  Series: 'series',
  Season: 'season',
  Episode: 'episode',
  BoxSet: 'collection',
  MusicArtist: 'artist',
  MusicAlbum: 'album',
  Audio: 'track',
  Playlist: 'playlist',
  Person: 'person',
};

const CREDIT_ROLE_BY_TYPE: Record<string, CreditRole> = {
  Actor: 'actor',
  GuestStar: 'actor',
  Director: 'director',
  Writer: 'writer',
  Producer: 'producer',
  Composer: 'composer',
};

export function itemKind(type: string | null | undefined): ItemKind {
  return KIND_BY_TYPE[type ?? ''] ?? 'other';
}

export function toUserState(dto: BaseItemDto): UserState {
  const data: Partial<UserItemDataDto> = dto.UserData ?? {};
  const resume = data.PlaybackPositionTicks ? ticksToMs(data.PlaybackPositionTicks) : undefined;
  return {
    played: data.Played === true,
    playCount: data.PlayCount ?? 0,
    favorite: data.IsFavorite === true,
    resumePositionMs: resume,
    lastPlayedAt: opt(data.LastPlayedDate),
    unplayedCount: opt(data.UnplayedItemCount),
  };
}

function toCredit(person: BaseItemPerson): Credit {
  return {
    personId: opt(person.Id),
    name: person.Name ?? '',
    role: CREDIT_ROLE_BY_TYPE[person.Type ?? ''] ?? 'other',
    character: opt(person.Role),
    image: jellyfinImageRef(person.Id, 'Primary', person.PrimaryImageTag),
  };
}

function toArtistRefs(dto: BaseItemDto, preferAlbumArtists = false): ArtistRef[] {
  const refs = preferAlbumArtists && dto.AlbumArtists?.length ? dto.AlbumArtists : dto.ArtistItems;
  if (refs?.length) return refs.map((a) => ({ id: opt(a.Id), name: a.Name ?? '' }));
  return list(dto.Artists).map((name) => ({ name }));
}

function toBase(dto: BaseItemDto): ItemBase {
  return {
    id: dto.Id ?? '',
    kind: itemKind(dto.Type),
    title: dto.Name ?? '',
    sortTitle: opt(dto.SortName),
    originalTitle: opt(dto.OriginalTitle),
    overview: opt(dto.Overview),
    tagline: opt(dto.Taglines?.[0]),
    year: opt(dto.ProductionYear),
    premiereDate: opt(dto.PremiereDate),
    rating: opt(dto.CommunityRating),
    contentRating: opt(dto.OfficialRating),
    genres: list(dto.Genres),
    studios: list(dto.Studios).map((s) => s.Name ?? '').filter(Boolean),
    durationMs: ticksToMs(dto.RunTimeTicks),
    addedAt: opt(dto.DateCreated),
    images: itemImages(dto),
    user: toUserState(dto),
    libraryId: undefined,
  };
}

function credits(dto: BaseItemDto): Credit[] {
  return list(dto.People).map(toCredit);
}

function seriesStatus(status: string | null | undefined): 'continuing' | 'ended' | undefined {
  if (status === 'Continuing') return 'continuing';
  return status === 'Ended' ? 'ended' : undefined;
}

type Builder = (dto: BaseItemDto, base: ItemBase) => MediaItem;

const BUILDERS: Partial<Record<ItemKind, Builder>> = {
  movie: (dto, base) => ({ ...base, kind: 'movie', versions: toMediaVersions(dto), credits: credits(dto) }),
  series: (dto, base) => ({
    ...base,
    kind: 'series',
    status: seriesStatus(dto.Status),
    seasonCount: opt(dto.ChildCount),
    episodeCount: opt(dto.RecursiveItemCount),
    credits: credits(dto),
  }),
  season: (dto, base) => ({
    ...base,
    kind: 'season',
    seriesId: dto.SeriesId ?? dto.ParentId ?? '',
    seriesTitle: dto.SeriesName ?? '',
    seasonNumber: opt(dto.IndexNumber),
    episodeCount: opt(dto.ChildCount),
  }),
  episode: (dto, base) => ({
    ...base,
    kind: 'episode',
    seriesId: dto.SeriesId ?? '',
    seriesTitle: dto.SeriesName ?? '',
    seasonId: opt(dto.SeasonId ?? dto.ParentId),
    seasonTitle: opt(dto.SeasonName),
    seasonNumber: opt(dto.ParentIndexNumber),
    episodeNumber: opt(dto.IndexNumber),
    versions: toMediaVersions(dto),
    credits: credits(dto),
  }),
  collection: (dto, base) => ({ ...base, kind: 'collection', itemCount: opt(dto.ChildCount) }),
  artist: (dto, base) => ({ ...base, kind: 'artist', albumCount: opt(dto.AlbumCount) }),
  album: (dto, base) => ({ ...base, kind: 'album', artists: toArtistRefs(dto, true), trackCount: opt(dto.ChildCount ?? dto.SongCount) }),
  track: (dto, base) => ({
    ...base,
    kind: 'track',
    albumId: opt(dto.AlbumId),
    albumTitle: opt(dto.Album),
    artists: toArtistRefs(dto),
    albumArtist: opt(dto.AlbumArtist),
    albumArtists: (dto.AlbumArtists ?? []).map((a) => ({ id: opt(a.Id), name: a.Name ?? '' })),
    trackNumber: opt(dto.IndexNumber),
    discNumber: opt(dto.ParentIndexNumber),
    hasLyrics: opt(dto.HasLyrics),
    gainDb: opt(dto.NormalizationGain),
    versions: toMediaVersions(dto),
  }),
  playlist: (dto, base) => ({ ...base, kind: 'playlist', mediaType: playlistMediaType(dto.MediaType), itemCount: opt(dto.ChildCount) }),
  person: (_dto, base) => ({ ...base, kind: 'person' }),
};

function playlistMediaType(mediaType: string | null | undefined): 'audio' | 'video' | 'mixed' {
  if (mediaType === 'Audio') return 'audio';
  return mediaType === 'Video' ? 'video' : 'mixed';
}

export function toMediaItem(dto: BaseItemDto): MediaItem {
  const base = toBase(dto);
  const build = BUILDERS[base.kind];
  return build ? build(dto, base) : { ...base, kind: 'other' };
}
