/**
 * Plex Media Server JSON shapes (`Accept: application/json`), limited to the
 * fields Vela reads. Verified against PMS 1.43.5 responses in `__fixtures__`.
 * Times are milliseconds, dates are Unix seconds, bitrates kbps.
 */

export interface PlexTag {
  id?: number;
  tag: string;
  role?: string;
  thumb?: string;
  tagKey?: string;
}

export interface PlexImage {
  type: 'coverPoster' | 'background' | 'clearLogo' | 'backgroundSquare' | 'snapshot' | string;
  url: string;
  alt?: string;
}

/** streamType: 1 video, 2 audio, 3 subtitle, 4 lyrics. */
export interface PlexStream {
  id: number;
  streamType: 1 | 2 | 3 | 4;
  index?: number;
  key?: string;
  codec?: string;
  profile?: string;
  level?: number;
  bitrate?: number;
  width?: number;
  height?: number;
  bitDepth?: number;
  frameRate?: number;
  colorTrc?: string;
  colorSpace?: string;
  colorPrimaries?: string;
  chromaSubsampling?: string;
  scanType?: string;
  refFrames?: number;
  DOVIPresent?: boolean;
  DOVIProfile?: number;
  channels?: number;
  audioChannelLayout?: string;
  samplingRate?: number;
  language?: string;
  languageCode?: string;
  title?: string;
  displayTitle?: string;
  default?: boolean;
  forced?: boolean;
  hearingImpaired?: boolean;
  selected?: boolean;
}

export interface PlexPart {
  id: number;
  key: string;
  file?: string;
  duration?: number;
  size?: number;
  container?: string;
  Stream?: PlexStream[];
}

export interface PlexMedia {
  id: number;
  duration?: number;
  aspectRatio?: number;
  bitrate?: number;
  container?: string;
  videoResolution?: string;
  editionTitle?: string;
  Part?: PlexPart[];
}

export interface PlexMarker {
  type: 'intro' | 'credits' | 'commercial' | string;
  startTimeOffset: number;
  endTimeOffset: number;
}

export interface PlexChapter {
  tag?: string;
  index?: number;
  startTimeOffset: number;
  endTimeOffset?: number;
}

export type PlexItemType = 'movie' | 'show' | 'season' | 'episode' | 'collection' | 'artist' | 'album' | 'track' | 'playlist' | string;

export interface PlexMetadata {
  ratingKey: string;
  key?: string;
  type: PlexItemType;
  title: string;
  titleSort?: string;
  originalTitle?: string;
  summary?: string;
  tagline?: string;
  year?: number;
  originallyAvailableAt?: string;
  rating?: number;
  audienceRating?: number;
  contentRating?: string;
  studio?: string;
  duration?: number;
  addedAt?: number;
  index?: number;
  parentIndex?: number;
  parentRatingKey?: string;
  parentTitle?: string;
  parentThumb?: string;
  grandparentRatingKey?: string;
  grandparentTitle?: string;
  grandparentThumb?: string;
  grandparentArt?: string;
  librarySectionID?: number;
  thumb?: string;
  art?: string;
  viewCount?: number;
  viewOffset?: number;
  lastViewedAt?: number;
  leafCount?: number;
  viewedLeafCount?: number;
  childCount?: number;
  playlistType?: 'audio' | 'video' | 'photo';
  Image?: PlexImage[];
  Genre?: PlexTag[];
  Role?: PlexTag[];
  Director?: PlexTag[];
  Writer?: PlexTag[];
  Producer?: PlexTag[];
  Media?: PlexMedia[];
  Marker?: PlexMarker[];
  Chapter?: PlexChapter[];
}

export interface PlexDirectory {
  key: string;
  type: string;
  title: string;
  thumb?: string;
  art?: string;
}

export interface PlexHub {
  type: string;
  hubIdentifier?: string;
  size?: number;
  Metadata?: PlexMetadata[];
}

export interface PlexContainer<T = PlexMetadata> {
  MediaContainer: {
    size?: number;
    totalSize?: number;
    offset?: number;
    Metadata?: T[];
    Directory?: PlexDirectory[];
    Hub?: PlexHub[];
  };
}
