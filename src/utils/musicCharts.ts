import type { ArtistRef, ImageRef, Track } from '@/domain';

export interface ChartArtist { id: string; name: string; plays: number }
export interface ChartAlbum { id: string; title: string; artist: string; plays: number; cover?: ImageRef }
export interface MusicCharts { artists: ChartArtist[]; albums: ChartAlbum[]; tracks: Track[] }

const TOP_ARTISTS = 10;
const TOP_ALBUMS = 10;
const TOP_TRACKS = 25;

const byPlays = <T extends { plays: number }>(a: T, b: T) => b.plays - a.plays;

function mainArtist(track: Track): ArtistRef | undefined {
  return track.albumArtists.find((a) => a.id) ?? track.artists.find((a) => a.id);
}

/** Adds `plays` to the entry under `id`, creating it with `make` the first time. */
function tally<T extends { plays: number }>(map: Map<string, T>, id: string, plays: number, make: () => T) {
  const entry = map.get(id) ?? make();
  entry.plays += plays;
  map.set(id, entry);
}

/**
 * Most played artists, albums and tracks, from tracks with their play counts.
 * Albums and artists add up their tracks: servers don't count album plays.
 */
export function musicCharts(tracks: Track[]): MusicCharts {
  const played = tracks.filter((t) => t.user.playCount > 0).sort((a, b) => b.user.playCount - a.user.playCount);
  const albums = new Map<string, ChartAlbum>();
  const artists = new Map<string, ChartArtist>();
  for (const track of played) {
    const plays = track.user.playCount;
    const artist = mainArtist(track);
    if (track.albumId) {
      tally(albums, track.albumId, plays, () => ({
        id: track.albumId!, title: track.albumTitle ?? '', artist: track.albumArtist ?? artist?.name ?? '', plays: 0, cover: track.images.poster,
      }));
    }
    if (artist?.id) tally(artists, artist.id, plays, () => ({ id: artist.id!, name: artist.name, plays: 0 }));
  }
  return {
    artists: [...artists.values()].sort(byPlays).slice(0, TOP_ARTISTS),
    albums: [...albums.values()].sort(byPlays).slice(0, TOP_ALBUMS),
    tracks: played.slice(0, TOP_TRACKS),
  };
}
