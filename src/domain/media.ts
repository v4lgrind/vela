/**
 * Vela's media model. Backends map their wire formats into these types; nothing
 * outside `src/backends` sees a Jellyfin or Plex DTO.
 *
 * Units: durations and positions are milliseconds. Dates are ISO 8601 strings.
 */

/** Opaque item id, unique within one server. */
export type ItemId = string;

/** Opaque image reference produced by a backend; turned into a URL by `MediaBackend.imageUrl`. */
export type ImageRef = string;

export type ItemKind =
  | 'movie'
  | 'series'
  | 'season'
  | 'episode'
  | 'collection'
  | 'artist'
  | 'album'
  | 'track'
  | 'playlist'
  | 'person'
  | 'other';

/**
 * Images by role. `poster` is the item's main art (2:3 for video, square for
 * music); episodes and seasons fall back to their series' poster. `thumb` is a
 * 16:9 still (episode frame). `backdrop` falls back to the parent's backdrop.
 */
export interface Images {
  poster?: ImageRef;
  thumb?: ImageRef;
  backdrop?: ImageRef;
  logo?: ImageRef;
}

/** Per-user state of an item. */
export interface UserState {
  played: boolean;
  playCount: number;
  favorite: boolean;
  /** Resume point; undefined when not started or finished. */
  resumePositionMs?: number;
  lastPlayedAt?: string;
  /** Unwatched children (series, season). */
  unplayedCount?: number;
}

export type CreditRole = 'actor' | 'director' | 'writer' | 'producer' | 'composer' | 'other';

export interface Credit {
  /** Person id when the server exposes a person page. */
  personId?: string;
  name: string;
  role: CreditRole;
  /** Character played (actors). */
  character?: string;
  image?: ImageRef;
}

export interface ItemBase {
  id: ItemId;
  kind: ItemKind;
  title: string;
  sortTitle?: string;
  originalTitle?: string;
  overview?: string;
  tagline?: string;
  year?: number;
  premiereDate?: string;
  /** Community / audience rating on a 0–10 scale. */
  rating?: number;
  /** Age rating as shown by the server ("PG-13", "fr/12"…). */
  contentRating?: string;
  genres: string[];
  studios: string[];
  durationMs?: number;
  addedAt?: string;
  images: Images;
  user: UserState;
  /** Library holding the item, when the server says so. */
  libraryId?: string;
}

export interface Movie extends ItemBase {
  kind: 'movie';
  versions: MediaVersion[];
  credits: Credit[];
}

export interface Series extends ItemBase {
  kind: 'series';
  status?: 'continuing' | 'ended';
  seasonCount?: number;
  episodeCount?: number;
  credits: Credit[];
}

export interface Season extends ItemBase {
  kind: 'season';
  seriesId: ItemId;
  seriesTitle: string;
  seasonNumber?: number;
  episodeCount?: number;
}

export interface Episode extends ItemBase {
  kind: 'episode';
  seriesId: ItemId;
  seriesTitle: string;
  seasonId?: ItemId;
  seasonNumber?: number;
  episodeNumber?: number;
  versions: MediaVersion[];
  credits: Credit[];
}

export interface Collection extends ItemBase {
  kind: 'collection';
  itemCount?: number;
}

export interface Artist extends ItemBase {
  kind: 'artist';
  albumCount?: number;
}

export interface ArtistRef {
  id?: ItemId;
  name: string;
}

export interface Album extends ItemBase {
  kind: 'album';
  artists: ArtistRef[];
  trackCount?: number;
}

export interface Track extends ItemBase {
  kind: 'track';
  albumId?: ItemId;
  albumTitle?: string;
  artists: ArtistRef[];
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;
  /** Undefined when the server does not say. */
  hasLyrics?: boolean;
  versions: MediaVersion[];
}

export interface Playlist extends ItemBase {
  kind: 'playlist';
  mediaType: 'audio' | 'video' | 'mixed';
  itemCount?: number;
}

export interface Person extends ItemBase {
  kind: 'person';
}

export interface OtherItem extends ItemBase {
  kind: 'other';
}

export type MediaItem =
  | Movie
  | Series
  | Season
  | Episode
  | Collection
  | Artist
  | Album
  | Track
  | Playlist
  | Person
  | OtherItem;

export type PlayableItem = Movie | Episode | Track;

export type LibraryKind = 'movies' | 'shows' | 'music' | 'mixed' | 'other';

export interface Library {
  id: string;
  title: string;
  kind: LibraryKind;
  images: Images;
}

// ── Media versions and streams ───────────────────────────────────────────────

export type VideoRange = 'sdr' | 'hdr10' | 'hdr10+' | 'hlg' | 'dolby-vision' | 'unknown';

export interface VideoStream {
  /** Opaque, backend-specific. */
  id: string;
  codec?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  bitDepth?: number;
  frameRate?: number;
  bitrate?: number;
  range: VideoRange;
  /** Dolby Vision profile number when `range` is dolby-vision. */
  dolbyVisionProfile?: number;
}

export interface AudioStream {
  id: string;
  language?: string;
  title?: string;
  codec?: string;
  profile?: string;
  channels?: number;
  channelLayout?: string;
  bitrate?: number;
  sampleRate?: number;
  isDefault: boolean;
}

export interface SubtitleStream {
  id: string;
  language?: string;
  title?: string;
  codec?: string;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
  isExternal: boolean;
  /** Image subtitles (PGS, VobSub) can only be burned in. */
  format: 'text' | 'image';
}

/** One file (or edition) of an item. */
export interface MediaVersion {
  id: string;
  name?: string;
  container?: string;
  sizeBytes?: number;
  bitrate?: number;
  durationMs?: number;
  video: VideoStream[];
  audio: AudioStream[];
  subtitles: SubtitleStream[];
}
