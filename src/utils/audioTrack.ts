import type { ArtistRef, MediaItem, Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

const MS_PER_SECOND = 1000;

function linkedArtists(refs: ArtistRef[]): { id: string; name: string }[] {
  return refs.flatMap((artist) => (artist.id ? [{ id: artist.id, name: artist.name }] : []));
}

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
    artists: linkedArtists(track.artists.length ? track.artists : track.albumArtists),
  };
}

/** A queue saved before tracks carried their cover or artists. */
export function needsServerDetails(track: AudioTrack): boolean {
  return !track.artwork || !track.artists;
}

/** Completes such a track from the server's item; never overwrites what it has. */
export function withServerDetails(track: AudioTrack, item: MediaItem | undefined): AudioTrack {
  if (!item) return track;
  const artists = track.artists ?? (item.kind === 'track' ? linkedArtists(item.artists.length ? item.artists : item.albumArtists) : undefined);
  return { ...track, artwork: track.artwork ?? item.images.poster, artists };
}
