/** Player view models (server-agnostic). Track indexes are the numeric form of domain stream ids. */

export interface SubtitleTrack {
  index: number;
  language: string;
  label: string;
  playbackMode: 'external' | 'burn-in';
  deliveryUrl?: string;
  deliveryFormat?: 'vtt' | 'srt' | 'ass';
  /** A subtitle file beside the video (not inside the container). */
  isExternalFile?: boolean;
  format?: 'text' | 'image';
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
