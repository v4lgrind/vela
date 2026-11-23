/** Player view models (server-agnostic). Track indexes are the numeric form of domain stream ids. */

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
