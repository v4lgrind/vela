import { playedPercent } from '@/domain';
import type { MediaItem } from '@/domain';
import type { DownloadedMedia, WatchProgress } from '@/services/offlineDatabase';

/** Seconds, 0–100, played flag, last playback time in ms (0 when unknown). */
export interface EffectiveProgress {
  position: number;
  percentage: number;
  played: boolean;
  lastPlayed: number;
}

/** "Reprendre" lists videos started and under this percentage, like useOfflinePlayer's `completed`. */
const RESUME_MAX_PERCENTAGE = 90;
const MS_PER_SECOND = 1000;

function lastPlayedOf(item: MediaItem): number {
  const parsed = item.user.lastPlayedAt ? Date.parse(item.user.lastPlayedAt) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The most recent playback wins: progress saved offline, or the server's user data. */
export function effectiveProgress(item: MediaItem, local?: WatchProgress): EffectiveProgress {
  const serverLastPlayed = lastPlayedOf(item);
  if (local && local.lastWatched >= serverLastPlayed) {
    return { position: local.position, percentage: local.percentage, played: local.completed, lastPlayed: local.lastWatched };
  }
  return {
    position: (item.user.resumePositionMs ?? 0) / MS_PER_SECOND,
    percentage: item.user.played ? 100 : playedPercent(item),
    played: item.user.played,
    lastPlayed: serverLastPlayed,
  };
}

/**
 * Where offline playback starts, by the same rule: undefined to start over
 * (nothing played, finished, or past the resume threshold).
 */
export function offlineResumeSeconds(item: MediaItem, local?: WatchProgress): number | undefined {
  const progress = effectiveProgress(item, local);
  return progress.position > 0 && !progress.played && progress.percentage < RESUME_MAX_PERCENTAGE
    ? progress.position
    : undefined;
}

export function resumeCandidates(
  downloads: DownloadedMedia[],
  local: Map<string, WatchProgress>,
): { media: DownloadedMedia; progress: EffectiveProgress }[] {
  return downloads
    .filter((media) => media.item.kind === 'movie' || media.item.kind === 'episode')
    .map((media) => ({ media, progress: effectiveProgress(media.item, local.get(media.itemId)) }))
    .filter(({ progress }) => progress.position > 0 && progress.percentage < RESUME_MAX_PERCENTAGE && !progress.played)
    .sort((a, b) => b.progress.lastPlayed - a.progress.lastPlayed);
}
