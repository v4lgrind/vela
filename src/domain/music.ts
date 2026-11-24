export interface AudioStreamRequest {
  /** Bits per second. */
  maxBitrate: number;
  /** Containers the output device plays without transcoding. */
  directContainers: string[];
  /** Progressive transcode for players that cannot follow HLS (ExoPlayer, Cast). */
  transcode: { container: string; codec: string; protocol: 'http' | 'hls' };
}

export interface LyricLine {
  text: string;
  /** Milliseconds from the start of the track; null for unsynced lyrics. */
  startMs: number | null;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
}
