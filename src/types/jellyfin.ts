export type JellyfinItemType =
  | 'Movie'
  | 'Series'
  | 'Season'
  | 'Episode'
  | 'Audio'
  | 'MusicAlbum'
  | 'BoxSet'
  | 'Person'
  | 'Studio'
  | 'Genre';

export type MediaStreamType = 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | 'Data';

export interface MediaStream {
  Index: number;
  Type: MediaStreamType;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  SupportsExternalStream?: boolean;
  DeliveryUrl?: string;
  Width?: number;
  Height?: number;
  BitRate?: number;
  Profile?: string;
  Level?: number;
  SampleRate?: number;
  Channels?: number;
  ChannelLayout?: string;
  RealFrameRate?: number;
  AverageFrameRate?: number;
  ColorSpace?: string;
  ColorTransfer?: string;
  ColorPrimaries?: string;
  VideoRange?: string;
  VideoRangeType?: string;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  Bitrate?: number;
  Size?: number;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  MediaStreams?: MediaStream[];
  RunTimeTicks?: number;
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
}

export interface PlaybackInfo {
  MediaSources?: MediaSource[];
  PlaySessionId?: string;
}

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  LastPlayedDate?: string;
}

export interface JellyfinItem {
  Id: string;
  Name?: string;
  Type?: JellyfinItemType;
  MediaType?: string;
  Overview?: string;
  Genres?: string[];
  ProductionYear?: number;
  CommunityRating?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  AlbumId?: string;
  Album?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ParentId?: string;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  MediaStreams?: MediaStream[];
  MediaSources?: MediaSource[];
  UserData?: UserData;
  People?: PersonRole[];
  Studios?: Studio[];
}

export interface PersonRole {
  Id?: string;
  Name: string;
  Role?: string;
  Type?: string;
  PrimaryImageTag?: string;
}

export interface Studio {
  Name: string;
  Id?: string;
}

export interface IntroSegment {
  Type: 'Intro' | 'Outro' | 'Recap' | 'Preview';
  StartTicks: number;
  EndTicks: number;
}

export interface SubtitleTrack {
  index: number;
  language: string;
  label: string;
  playbackMode: 'external' | 'burn-in';
  deliveryUrl?: string;
}

export interface AudioTrack {
  index: number;
  language: string;
  label: string;
}

export interface QualityPreset {
  label: string;
  bitrate: number;
  minHeight: number;
}
