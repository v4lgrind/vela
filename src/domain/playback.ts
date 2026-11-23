import type { ItemId } from './media';
import type { MediaVersion } from './streams';

/** What the device can decode; filled by the platform layer (codec detection). */
export interface DeviceCapabilities {
  hardwareVideoCodecs: string[];
  softwareVideoCodecs: string[];
  platformAudioCodecs: string[];
  ffmpegAudioCodecs: string[];
  ffmpegVideoCodecs: string[];
  displayWidth: number;
  displayHeight: number;
}

export interface SubtitleChoice {
  streamId: string;
  mode: 'external' | 'burn-in';
}

/**
 * What the player wants. Backends translate it into their protocol
 * (Jellyfin DeviceProfile + PlaybackInfo, Plex client profile + transcode decision).
 */
export interface PlaybackRequest {
  itemId: ItemId;
  versionId?: string;
  startMs?: number;
  audioStreamId?: string;
  subtitle?: SubtitleChoice | null;
  /** Bits per second; undefined = no cap. */
  maxBitrate?: number;
  maxSize?: { width: number; height: number };
  /** Undefined on the web preview: the backend uses its browser profile. */
  device?: DeviceCapabilities;
  constraints: PlaybackConstraints;
  target: 'native' | 'web';
}

/** The player's fallbacks, named. */
export interface PlaybackConstraints {
  /** False forces a transcode (quality cap, burn-in, decode failure). */
  allowDirectPlay: boolean;
  allowVideoCopy: boolean;
  /** False after an audio decode failure (e.g. E-AC3 + Atmos). */
  allowAudioCopy: boolean;
  /** Codecs the transcoder must not output, e.g. ['hevc'] after a decode failure. */
  excludeVideoCodecs: string[];
}

export type PlayMethod = 'direct-play' | 'direct-stream' | 'transcode';

export interface ExternalSubtitle {
  streamId: string;
  url: string;
  format: 'vtt' | 'srt' | 'ass';
}

export interface PlaybackPlan {
  method: PlayMethod;
  url: string;
  /** Headers every request of this stream needs (playlist and segments). */
  headers: Record<string, string>;
  /** Streams as the server will deliver them. */
  version: MediaVersion;
  /** Stream position at the URL's start; HLS transcodes start at the resume point. */
  startOffsetMs: number;
  externalSubtitles: ExternalSubtitle[];
  /** Opaque session handle for reporting and stopping the transcode. */
  sessionId: string;
}

export interface PlaybackProgress {
  positionMs: number;
  durationMs?: number;
  isPaused: boolean;
}

/** Reports one playback session to the server and releases its resources. */
export interface PlaybackReporter {
  start(progress: PlaybackProgress): Promise<void>;
  progress(progress: PlaybackProgress): Promise<void>;
  stop(progress: PlaybackProgress): Promise<void>;
  /** Kills the server transcode, if any (track switch, quality change, exit). */
  release(): Promise<void>;
}

export type MarkerKind = 'intro' | 'credits' | 'recap' | 'preview';

export interface Marker {
  kind: MarkerKind;
  startMs: number;
  endMs: number;
}

export interface Chapter {
  title?: string;
  startMs: number;
  endMs?: number;
}

/** Seek-bar thumbnails, in the server's native format. */
export type Trickplay =
  | {
      format: 'tiles';
      urlTemplate: string;
      headers: Record<string, string>;
      tileWidth: number;
      tileHeight: number;
      columns: number;
      rows: number;
      intervalMs: number;
      thumbnailCount: number;
    }
  | { format: 'bif'; url: string; headers: Record<string, string> };

/** Live session details shown in the player's stream info panel. */
export interface StreamInfo {
  method: PlayMethod;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  bitrate?: number;
  transcodeReasons: string[];
}
