import type { Album, AudioStreamRequest, MusicPort, PlaybackPlan, Track } from '@/domain';

import type { PlexClient } from './client';
import { toLyrics, toMediaItem } from './mappers';
import { createPlexPlayback } from './playback';
import type { PlexMetadata } from './types';

const UNIVERSAL = '/music/:/transcode/universal';
/**
 * Below this the user capped music quality: go through the universal stream,
 * which copies files already under the cap. The file bitrate is not known when
 * the URL is built.
 */
const CAP_THRESHOLD_BPS = 10_000_000;
const LYRICS_STREAM = 4;
/** Share of a track after which it counts as played. */
const PLAYED_RATIO = 0.9;
const LIBRARY = 'com.plexapp.plugins.library';

const toTracks = (metadata: PlexMetadata[]) => metadata.map(toMediaItem).filter((item): item is Track => item.kind === 'track');

function fileExtension(streamRef: string): string {
  return streamRef.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
}

function isDirectlyPlayable(streamRef: string, request: AudioStreamRequest): boolean {
  if (request.maxBitrate < CAP_THRESHOLD_BPS) return false;
  const extension = fileExtension(streamRef);
  return request.directContainers.some((entry) => entry.split('|')[0] === extension);
}

/** Plex music through MusicPort: browse lists, direct file or universal stream, lyrics file, timeline. */
export function createPlexMusic(client: PlexClient): MusicPort {
  const playback = createPlexPlayback(client);

  function universalUrl(trackId: string, request: AudioStreamRequest): string {
    const { container, codec, protocol } = request.transcode;
    const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return client.url(`${UNIVERSAL}/start.${protocol === 'hls' ? 'm3u8' : container}`, {
      path: `/library/metadata/${trackId}`,
      protocol,
      directPlay: 0,
      directStream: 1,
      musicBitrate: Math.round(request.maxBitrate / 1000),
      session,
      'X-Plex-Session-Identifier': session,
      'X-Plex-Client-Identifier': client.connection.deviceId,
      'X-Plex-Product': client.identity.product,
      'X-Plex-Client-Profile-Name': 'Generic',
      'X-Plex-Client-Profile-Extra': `add-transcode-target(type=musicProfile&context=streaming&protocol=${protocol}&container=${container}&audioCodec=${codec})`,
    });
  }

  async function lyrics(trackId: string) {
    const [item] = await client.metadata(`/library/metadata/${trackId}`);
    const stream = item?.Media?.flatMap((media) => media.Part ?? []).flatMap((part) => part.Stream ?? [])
      .find((s) => s.streamType === LYRICS_STREAM && s.key);
    if (!stream?.key) return null;
    return toLyrics(await client.text(stream.key), stream.codec ?? '');
  }

  // Track reports carry no transcode session: the timeline is enough.
  const trackPlan = { sessionId: '' } as PlaybackPlan;

  return {
    artistAlbums: async (artistId) => (await client.metadata(`/library/metadata/${artistId}/children`))
      .map(toMediaItem)
      .filter((item): item is Album => item.kind === 'album')
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    artistTracks: async (artistId) => toTracks(await client.metadata(`/library/metadata/${artistId}/allLeaves`)),
    albumTracks: async (albumId) => toTracks(await client.metadata(`/library/metadata/${albumId}/children`)),
    playlistTracks: async (playlistId) => toTracks(await client.metadata(`/playlists/${playlistId}/items`)),
    randomTracks: async (libraryId, limit) => toTracks(await client.metadata(
      `/library/sections/${libraryId}/all`, { type: 10, sort: 'random' }, { offset: 0, limit },
    )),
    // Sonic radio (Plex analysis) comes later: Capabilities.radio is false.
    radio: async () => [],
    streamUrl: (trackId, request, streamRef) => (streamRef && isDirectlyPlayable(streamRef, request)
      ? client.url(streamRef)
      : universalUrl(trackId, request)),
    lyrics,
    // PMS keeps no play count from a music timeline (checked live): a track
    // stopped near its end is scrobbled explicitly, like other Plex clients do.
    reporter: (trackId) => {
      const timeline = playback.reporter(trackPlan, trackId);
      return {
        ...timeline,
        stop: async (progress) => {
          await timeline.stop(progress);
          if (progress.durationMs && progress.positionMs >= progress.durationMs * PLAYED_RATIO) {
            await client.send('GET', '/:/scrobble', { key: trackId, identifier: LIBRARY });
          }
        },
      };
    },
  };
}
