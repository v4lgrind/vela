import type { Capabilities, ClientIdentity, MediaBackend, ServerConnection } from '@/domain';

import { createJellyfinCatalog } from './catalog';
import { JellyfinClient } from './client';
import { jellyfinImageUrl } from './mappers';
import { createJellyfinMusic } from './music';
import { negotiate } from './playback/negotiate';
import { createReporter, fetchChapters, fetchMarkers, fetchStreamInfo, fetchTrickplay } from './playback/session';

const CAPABILITIES: Capabilities = {
  music: true,
  downloads: true,
  transcodedDownloads: true,
  markers: true,
  chapters: true,
  trickplay: true,
  lyrics: true,
  favorites: true,
  similar: true,
  personPages: true,
  serverStreamInfo: true,
  cast: true,
  androidAuto: true,
};

/** Ports still served by the legacy code paths; they move here in later phases. */
function notMigrated(port: string): never {
  throw new Error(`Jellyfin ${port} is not served by the backend yet`);
}

export function createJellyfinBackend(connection: ServerConnection, token: string, identity: ClientIdentity): MediaBackend {
  const client = new JellyfinClient(connection, token, identity);
  return {
    kind: 'jellyfin',
    connection,
    capabilities: CAPABILITIES,
    imageUrl: (ref, size) => jellyfinImageUrl(connection.baseUrl, ref, size),
    authHeaders: () => ({ Authorization: client.authorization }),
    catalog: createJellyfinCatalog(client),
    music: createJellyfinMusic(client),
    userData: {
      setPlayed: (id, played) => client.send(played ? 'POST' : 'DELETE', `/UserPlayedItems/${id}`, { userId: client.userId }),
      pushOfflineProgress: () => notMigrated('offline progress sync'),
    },
    playback: {
      negotiate: (request) => negotiate(client, request),
      reporter: (plan, itemId) => createReporter(client, plan, itemId),
      markers: (id) => fetchMarkers(client, id),
      chapters: (id) => fetchChapters(client, id),
      trickplay: (id, versionId) => fetchTrickplay(client, id, versionId),
      streamInfo: (plan) => fetchStreamInfo(client, plan),
    },
    downloads: { plan: () => notMigrated('downloads') },
    signOut: async () => undefined,
  };
}
