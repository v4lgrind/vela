import type { Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

/** Maps a Jellyfin Audio item to the player's track shape. */
export function toAudioTrack(raw: any, albumNameFallback = ''): AudioTrack {
  return {
    id: raw.Id,
    name: raw.Name || '',
    artist: raw.AlbumArtist || raw.Artists?.join(', ') || '',
    albumId: raw.AlbumId || raw.ParentId || raw.Id,
    albumName: raw.Album || albumNameFallback,
    duration: raw.RunTimeTicks ? raw.RunTimeTicks / 10_000_000 : 0,
    indexNumber: raw.IndexNumber || 0,
  };
}

const MS_PER_SECOND = 1000;

/** Maps a domain track to the player's track shape. */
export function trackToAudioTrack(track: Track, albumNameFallback = ''): AudioTrack {
  return {
    id: track.id,
    name: track.title,
    artist: track.albumArtist || track.artists.map((artist) => artist.name).join(', '),
    albumId: track.albumId || track.id,
    albumName: track.albumTitle || albumNameFallback,
    duration: track.durationMs ? track.durationMs / MS_PER_SECOND : 0,
    indexNumber: track.trackNumber || 0,
  };
}
