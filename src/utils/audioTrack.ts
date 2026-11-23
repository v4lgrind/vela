import type { Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

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
    artwork: track.images.poster,
    streamRef: track.versions[0]?.streamRef,
  };
}
