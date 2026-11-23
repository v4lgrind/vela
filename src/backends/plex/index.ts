import type { BackendEvents, Capabilities, ClientIdentity, MediaBackend, ServerConnection } from '@/domain';

import { createPlexCatalog } from './catalog';
import { planPlexDownload } from './downloads';
import { PlexClient } from './client';
import { plexImageUrl } from './mappers';
import { createPlexMusic } from './music';
import { createPlexPlayback } from './playback';
import { createPlexUserData } from './userData';

/** v1 is video only (docs/superpowers/plans/2026-11-22-plex-support.md, "Decisions"). */
const CAPABILITIES: Capabilities = {
  music: true,
  downloads: true,
  transcodedDownloads: true,
  markers: true,
  chapters: true,
  trickplay: true,
  lyrics: true,
  favorites: false,
  similar: true,
  personPages: true,
  serverStreamInfo: false,
  cast: false,
  androidAuto: false,
};

export function createPlexBackend(connection: ServerConnection, token: string, identity: ClientIdentity, events: BackendEvents = {}): MediaBackend {
  const client = new PlexClient(connection, token, identity, events);
  return {
    kind: 'plex',
    connection,
    capabilities: CAPABILITIES,
    imageUrl: (ref, size) => plexImageUrl(client.baseUrl, token, ref, size),
    authHeaders: () => ({ ...client.headers }),
    catalog: createPlexCatalog(client),
    music: createPlexMusic(client),
    userData: createPlexUserData(client),
    playback: createPlexPlayback(client),
    downloads: { plan: (request) => planPlexDownload(client, request) },
    // The server token stays valid; Vela only forgets it (session store).
    signOut: async () => undefined,
  };
}
