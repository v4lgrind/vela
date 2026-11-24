import type { OfflineProgress } from '@/domain';

import type { JellyfinClient } from './client';
import { msToTicks } from './mappers';

/**
 * Offline progress wins only when it is the most recent playback: a position
 * the server recorded later (another device) is kept, not overwritten.
 */
export async function pushOfflineProgress(client: JellyfinClient, progress: OfflineProgress): Promise<'pushed' | 'kept'> {
  const path = `/UserItems/${progress.itemId}/UserData`;
  const query = { userId: client.userId };
  const current = await client.get<{ LastPlayedDate?: string | null }>(path, query);
  const serverLastPlayed = current.LastPlayedDate ? Date.parse(current.LastPlayedDate) : NaN;
  if (!Number.isNaN(serverLastPlayed) && serverLastPlayed > progress.lastPlayedAtMs) return 'kept';
  await client.send('POST', path, query, {
    PlaybackPositionTicks: progress.played ? 0 : msToTicks(progress.positionMs),
    // Only ever mark played: a partial rewatch must not un-mark a watched item.
    ...(progress.played ? { Played: true } : {}),
    LastPlayedDate: new Date(progress.lastPlayedAtMs).toISOString(),
  });
  return 'pushed';
}
