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
