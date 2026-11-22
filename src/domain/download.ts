import type { ItemId } from './media';
import type { Marker } from './playback';

export interface DownloadRequest {
  itemId: ItemId;
  versionId?: string;
  /** Undefined = original file. */
  transcode?: {
    maxBitrate?: number;
    maxSize?: { width: number; height: number };
    audioStreamId?: string;
    subtitleStreamId?: string;
  };
}

export interface DownloadSidecar {
  kind: 'subtitle';
  url: string;
  format: 'srt' | 'vtt' | 'ass';
  language?: string;
  label?: string;
}

export interface DownloadPlan {
  url: string;
  headers: Record<string, string>;
  fileExtension: string;
  estimatedSizeBytes?: number;
  sidecars: DownloadSidecar[];
  markers: Marker[];
}
