import type { LyricLine } from '@/domain';

const MS_PER_SECOND = 1000;

/** Index of the line being sung at `seconds`, -1 before the first one. */
export function activeLyricIndex(lines: LyricLine[], seconds: number): number {
  const ms = seconds * MS_PER_SECOND;
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].startMs ?? Infinity) > ms) break;
    index = i;
  }
  return index;
}
