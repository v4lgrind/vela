import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { LyricDto } from '@jellyfin/sdk/lib/generated-client/models/lyric-dto';

import type { Album, AudioStreamRequest, MusicPort, Track } from '@/domain';

import { toQueryString } from './client';
import type { JellyfinClient, Query } from './client';
import { JellyfinHttpError } from './http';
import { toLyrics, toMediaItem } from './mappers';
import { createReporter } from './playback/session';

/** Audio plays as a direct stream of the universal endpoint; Jellyfin only needs a session id to tie reports together. */
function audioSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const NOT_FOUND = 404;

export function createJellyfinMusic(client: JellyfinClient): MusicPort {
  const userId = client.userId;
  async function list<T>(query: Query): Promise<T[]> {
    const page = await client.get<{ Items?: BaseItemDto[] }>('/Items', { userId, ...query });
    return (page.Items ?? []).map(toMediaItem) as T[];
  }

  function streamUrl(trackId: string, request: AudioStreamRequest): string {
    const query = toQueryString({
      userId,
      ApiKey: client.token,
      MaxStreamingBitrate: request.maxBitrate,
      Container: request.directContainers.join(','),
      TranscodingContainer: request.transcode.container,
      TranscodingProtocol: request.transcode.protocol,
      AudioCodec: request.transcode.codec,
    });
    return `${client.serverUrl}/Audio/${trackId}/universal${query}`;
  }

  async function lyrics(trackId: string) {
    try {
      return toLyrics(await client.get<LyricDto>(`/Audio/${trackId}/Lyrics`));
    } catch (error) {
      if (error instanceof JellyfinHttpError && error.status === NOT_FOUND) return null;
      throw error;
    }
  }

  return {
    artistAlbums: (artistId) => list<Album>({
      recursive: true, albumArtistIds: [artistId], includeItemTypes: ['MusicAlbum'],
      sortBy: ['ProductionYear', 'SortName'], sortOrder: ['Descending', 'Ascending'],
    }),
    artistTracks: (artistId) => list<Track>({
      recursive: true, artistIds: [artistId], includeItemTypes: ['Audio'],
      sortBy: ['ProductionYear', 'Album', 'ParentIndexNumber', 'IndexNumber'],
    }),
    albumTracks: (albumId) => list<Track>({
      parentId: albumId, includeItemTypes: ['Audio'],
      sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'], sortOrder: ['Ascending'],
    }),
    // Playlist order is the server's: no sortBy.
    playlistTracks: (playlistId) => list<Track>({ parentId: playlistId, includeItemTypes: ['Audio'] }),
    randomTracks: (libraryId, limit) => list<Track>({
      parentId: libraryId, recursive: true, includeItemTypes: ['Audio'], sortBy: ['Random'], limit,
    }),
    mostPlayed: (libraryId, limit) => list<Track>({
      parentId: libraryId, recursive: true, includeItemTypes: ['Audio'], filters: ['IsPlayed'],
      sortBy: ['PlayCount'], sortOrder: ['Descending'], limit,
    }),
    // Instant Mix: genre-based picks, Jellyfin has no sonic analysis.
    radio: async (seedId, limit) => (await client.get<{ Items?: BaseItemDto[] }>(`/Items/${seedId}/InstantMix`, { userId, limit }))
      .Items?.map(toMediaItem).filter((item): item is Track => item.kind === 'track') ?? [],
    streamUrl,
    lyrics,
    reporter: (trackId) => createReporter(client, {
      method: 'direct-stream', url: '', headers: {}, mediaElementUrl: '', startOffsetMs: 0, externalSubtitles: [],
      transcodeReasons: [], sessionId: audioSessionId(), version: { id: trackId, video: [], audio: [], subtitles: [] },
    }, trackId),
  };
}
