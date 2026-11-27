import type { Album, ArtistRef, Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

/** A track or an album a music menu acts on. */
export type MusicTarget =
  | { kind: 'track'; id: string; albumId?: string; artists: ArtistRef[] }
  | { kind: 'album'; id: string; artists: ArtistRef[] };

export type MusicAction =
  | { type: 'goToAlbum'; itemId: string }
  | { type: 'goToArtist'; itemId: string; name: string }
  | { type: 'radio'; seedId: string }
  | { type: 'playNext' }
  | { type: 'addToQueue' };

export interface MusicActionContext {
  /** Item page the menu is shown on: a link to it is pointless. */
  currentPageId?: string;
  online: boolean;
  canRadio: boolean;
  queueActions: boolean;
}

function isDomainTrack(t: Track | AudioTrack): t is Track {
  return (t as Track).kind === 'track';
}

export function trackTarget(t: Track | AudioTrack): MusicTarget {
  if (isDomainTrack(t)) {
    return { kind: 'track', id: t.id, albumId: t.albumId, artists: t.artists.length ? t.artists : t.albumArtists };
  }
  // trackToAudioTrack falls back to the track id when the album is unknown.
  const albumId = t.albumId && t.albumId !== t.id ? t.albumId : undefined;
  return { kind: 'track', id: t.id, albumId, artists: t.artists ?? [] };
}

export function albumTarget(a: Album): MusicTarget {
  return { kind: 'album', id: a.id, artists: a.artists };
}

function goToActions(target: MusicTarget, currentPageId?: string): MusicAction[] {
  const actions: MusicAction[] = [];
  if (target.kind === 'track' && target.albumId && target.albumId !== currentPageId) {
    actions.push({ type: 'goToAlbum', itemId: target.albumId });
  }
  for (const artist of target.artists) {
    if (artist.id && artist.id !== currentPageId) actions.push({ type: 'goToArtist', itemId: artist.id, name: artist.name });
  }
  return actions;
}

export function buildMusicActions(target: MusicTarget, ctx: MusicActionContext): MusicAction[] {
  const actions = goToActions(target, ctx.currentPageId);
  if (ctx.online && ctx.canRadio) actions.push({ type: 'radio', seedId: target.id });
  if (ctx.queueActions) actions.push({ type: 'playNext' }, { type: 'addToQueue' });
  return actions;
}
