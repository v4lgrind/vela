import type { MediaItem } from './media';

/** Share of the item already watched, 0–100 (0 when not started or unknown length). */
export function playedPercent(item: Pick<MediaItem, 'durationMs' | 'user'>): number {
  const position = item.user.resumePositionMs ?? 0;
  if (!position || !item.durationMs) return 0;
  return Math.min(100, (position / item.durationMs) * 100);
}

/** Time left to watch from the resume point, in ms; 0 when not started. */
export function remainingMs(item: Pick<MediaItem, 'durationMs' | 'user'>): number {
  const position = item.user.resumePositionMs ?? 0;
  if (!position || !item.durationMs) return 0;
  return Math.max(0, item.durationMs - position);
}
