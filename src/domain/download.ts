import type { DeviceCapabilities, Marker } from './playback';
import type { ItemId } from './media';

/**
 * What to download. The app decides whether a transcode is needed (device
 * decoders, user choice); the backend decides how its server produces it.
 */
export interface DownloadRequest {
  itemId: ItemId;
  versionId?: string;
  target: 'native' | 'desktop';
  device?: DeviceCapabilities;
  /** Undefined = the original file. */
  transcode?: {
    /** Server-side cap (a quality preset). */
    maxBitrate?: number;
    /** Encoder bitrate and frame size forced on the stream (preset, or display-sized). */
    video?: { bitrate: number; maxSize?: { width: number; height: number } };
    audioStreamId?: string;
  };
  /** Text subtitle to save next to the file. */
  subtitleStreamId?: string;
}

export interface DownloadSidecar {
  kind: 'subtitle';
  url: string;
  format: 'srt' | 'vtt';
  language?: string;
  label?: string;
}

export interface DownloadPlan {
  url: string;
  headers: Record<string, string>;
  fileExtension: string;
  isTranscoded: boolean;
  estimatedSizeBytes?: number;
  sidecars: DownloadSidecar[];
  markers: Marker[];
}
