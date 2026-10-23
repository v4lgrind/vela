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

function lastPlayedOf(userData: { LastPlayedDate?: string | null } | undefined): number {
  const parsed = userData?.LastPlayedDate ? Date.parse(userData.LastPlayedDate) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The most recent playback wins: progress saved offline, or Jellyfin's user data. */
export function effectiveProgress(item: any, local?: WatchProgress): EffectiveProgress {
  const userData = item?.UserData ?? {};
  const serverLastPlayed = lastPlayedOf(userData);
  if (local && local.lastWatched >= serverLastPlayed) {
    return { position: local.position, percentage: local.percentage, played: local.completed, lastPlayed: local.lastWatched };
  }
  const position = (userData.PlaybackPositionTicks ?? 0) / 1e7;
  const runtime = (item?.RunTimeTicks ?? 0) / 1e7;
  return {
    position,
    percentage: userData.PlayedPercentage ?? (runtime ? (position / runtime) * 100 : 0),
    played: userData.Played === true,
    lastPlayed: serverLastPlayed,
  };
}

/**
 * Where offline playback starts, by the same rule: undefined to start over
 * (nothing played, finished, or past the resume threshold).
 */
export function offlineResumeSeconds(item: any, local?: WatchProgress): number | undefined {
  const progress = effectiveProgress(item, local);
  return progress.position > 0 && !progress.played && progress.percentage < RESUME_MAX_PERCENTAGE
    ? progress.position
    : undefined;
}

/** Push offline progress unless Jellyfin recorded a strictly newer playback. */
export function shouldPushLocal(local: WatchProgress, server: { LastPlayedDate?: string | null } | undefined): boolean {
  return local.lastWatched >= lastPlayedOf(server);
}

export function resumeCandidates(
  downloads: DownloadedMedia[],
  local: Map<string, WatchProgress>,
): { media: DownloadedMedia; progress: EffectiveProgress }[] {
  return downloads
    .filter((media) => media.type === 'Movie' || media.type === 'Episode')
    .map((media) => ({ media, progress: effectiveProgress(media.jellyfinItem, local.get(media.itemId)) }))
    .filter(({ progress }) => progress.position > 0 && progress.percentage < RESUME_MAX_PERCENTAGE && !progress.played)
    .sort((a, b) => b.progress.lastPlayed - a.progress.lastPlayed);
}
