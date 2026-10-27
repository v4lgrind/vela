import type { LyricDto } from '@jellyfin/sdk/lib/generated-client/models/lyric-dto';

export interface LyricLine {
  text: string;
  /** Seconds from the start of the track; null for unsynced lyrics. */
  start: number | null;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
}

const TICKS_PER_SECOND = 10_000_000;

export function toLyricLines(dto: LyricDto): Lyrics | null {
  const lines = (dto.Lyrics ?? []).map((line) => ({
    text: line.Text ?? '',
    start: line.Start == null ? null : line.Start / TICKS_PER_SECOND,
  }));
  if (!lines.length) return null;
  return { synced: lines.every((line) => line.start !== null), lines };
}

/** Index of the line being sung at `seconds`, -1 before the first one. */
export function activeLyricIndex(lines: LyricLine[], seconds: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].start ?? Infinity) > seconds) break;
    index = i;
  }
  return index;
}
