import type { BackendEvents, Capabilities, ClientIdentity, MediaBackend, MusicPort, ServerConnection } from '@/domain';

import { createPlexCatalog } from './catalog';
import { PlexClient } from './client';
import { plexImageUrl } from './mappers';
import { createPlexPlayback } from './playback';
import { createPlexUserData } from './userData';

/** v1 is video only (docs/superpowers/plans/2026-11-22-plex-support.md, "Decisions"). */
const CAPABILITIES: Capabilities = {
  music: false,
  downloads: false,
  transcodedDownloads: false,
  markers: true,
  chapters: true,
  trickplay: false,
  lyrics: false,
  favorites: false,
  similar: true,
  personPages: true,
  serverStreamInfo: false,
  cast: false,
  androidAuto: false,
};

const unsupported = (what: string) => () => {
  throw new Error(`Plex ${what} is not supported yet`);
};

/** Music is off for Plex (capabilities.music): the UI never calls it. */
const NO_MUSIC: MusicPort = {
  artistAlbums: async () => [],
  artistTracks: async () => [],
  albumTracks: async () => [],
  playlistTracks: async () => [],
  randomTracks: async () => [],
  streamUrl: unsupported('music'),
  lyrics: async () => null,
  reporter: unsupported('music'),
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
    music: NO_MUSIC,
    userData: createPlexUserData(client),
    playback: createPlexPlayback(client),
    downloads: { plan: async () => unsupported('downloads')() },
    // The server token stays valid; Vela only forgets it (session store).
    signOut: async () => undefined,
  };
}
