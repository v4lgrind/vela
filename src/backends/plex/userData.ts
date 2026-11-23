import type { OfflineProgress, UserDataPort } from '@/domain';

import type { PlexClient } from './client';

const LIBRARY = 'com.plexapp.plugins.library';

/** Watched state through `/:/scrobble`, `/:/unscrobble` and `/:/progress`. */
export function createPlexUserData(client: PlexClient): UserDataPort {
  const setPlayed = (id: string, played: boolean) =>
    client.send('GET', played ? '/:/scrobble' : '/:/unscrobble', { key: id, identifier: LIBRARY });

  /** Offline progress wins unless the server saw a later playback; it never un-marks played. */
  async function pushOfflineProgress(progress: OfflineProgress): Promise<'pushed' | 'kept'> {
    const [item] = await client.metadata(`/library/metadata/${progress.itemId}`);
    const serverPlayedAtMs = (item?.lastViewedAt ?? 0) * 1000;
    if (serverPlayedAtMs > progress.lastPlayedAtMs) return 'kept';
    if (progress.played) {
      await setPlayed(progress.itemId, true);
    } else {
      await client.send('GET', '/:/progress', {
        key: progress.itemId, identifier: LIBRARY, time: Math.round(progress.positionMs), state: 'stopped',
      });
    }
    return 'pushed';
  }

  return { setPlayed, pushOfflineProgress };
}
