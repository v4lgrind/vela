/** Files (versions) of a playable item and their streams. */

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
  dolbyVisionLevel?: number;
  // Technical details shown in the media info dialog.
  aspectRatio?: string;
  isInterlaced?: boolean;
  pixelFormat?: string;
  refFrames?: number;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
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
  /** File path on the server, when exposed. */
  path?: string;
  /** Backend-specific locator of the file for direct streaming (Plex: the part key). */
  streamRef?: string;
  container?: string;
  sizeBytes?: number;
  bitrate?: number;
  durationMs?: number;
  video: VideoStream[];
  audio: AudioStream[];
  subtitles: SubtitleStream[];
}
