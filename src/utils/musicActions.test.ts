import { describe, expect, it } from 'vitest';

import type { Album, Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

import { albumTarget, buildMusicActions, trackTarget } from './musicActions';
import type { MusicActionContext, MusicTarget } from './musicActions';

const ctx: MusicActionContext = { online: true, canRadio: true, queueActions: true };

const track: MusicTarget = {
  kind: 'track', id: 't1', albumId: 'al1',
  artists: [{ id: 'a1', name: 'Daft Punk' }, { id: 'a2', name: 'Pharrell Williams' }],
};

describe('buildMusicActions', () => {
  it('lists the album, each artist, radio and queue actions in order', () => {
    expect(buildMusicActions(track, ctx)).toEqual([
      { type: 'goToAlbum', itemId: 'al1' },
      { type: 'goToArtist', itemId: 'a1', name: 'Daft Punk' },
      { type: 'goToArtist', itemId: 'a2', name: 'Pharrell Williams' },
      { type: 'radio', seedId: 't1' },
      { type: 'playNext' },
      { type: 'addToQueue' },
    ]);
  });

  it("hides goToAlbum on that album's page", () => {
    const types = buildMusicActions(track, { ...ctx, currentPageId: 'al1' }).map((a) => a.type);
    expect(types).not.toContain('goToAlbum');
  });

  it("hides goToArtist on that artist's page", () => {
    const artists = buildMusicActions(track, { ...ctx, currentPageId: 'a1' }).filter((a) => a.type === 'goToArtist');
    expect(artists).toEqual([{ type: 'goToArtist', itemId: 'a2', name: 'Pharrell Williams' }]);
  });

  it('skips artists without id', () => {
    const target: MusicTarget = { kind: 'album', id: 'al1', artists: [{ name: 'Inconnu' }] };
    expect(buildMusicActions(target, ctx).map((a) => a.type)).toEqual(['radio', 'playNext', 'addToQueue']);
  });

  it("an album never offers to go to an album", () => {
    const target: MusicTarget = { kind: 'album', id: 'al1', artists: [{ id: 'a1', name: 'Daft Punk' }] };
    expect(buildMusicActions(target, ctx)[0]).toEqual({ type: 'goToArtist', itemId: 'a1', name: 'Daft Punk' });
  });

  it('lists up to three artists', () => {
    const artists = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
    const actions = buildMusicActions({ kind: 'album', id: 'al1', artists }, ctx);
    expect(actions.filter((a) => a.type === 'goToArtist')).toHaveLength(3);
  });

  it('offers no artist for a compilation (more than three album artists)', () => {
    const artists = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
    const types = buildMusicActions({ kind: 'album', id: 'al1', artists }, ctx).map((a) => a.type);
    expect(types).toEqual(['radio', 'playNext', 'addToQueue']);
  });

  it("hides radio offline or when the backend can't", () => {
    expect(buildMusicActions(track, { ...ctx, online: false }).map((a) => a.type)).not.toContain('radio');
    expect(buildMusicActions(track, { ...ctx, canRadio: false }).map((a) => a.type)).not.toContain('radio');
  });

  it('leaves out queue actions when asked (full-screen player)', () => {
    const types = buildMusicActions(track, { ...ctx, queueActions: false }).map((a) => a.type);
    expect(types).not.toContain('playNext');
    expect(types).not.toContain('addToQueue');
  });

  it('an old queue track (no artists) offline only goes to its album', () => {
    const old = { id: 't1', name: 'S', artist: 'X', albumId: 'al1', albumName: 'A', duration: 1, indexNumber: 1 } as AudioTrack;
    expect(buildMusicActions(trackTarget(old), { ...ctx, online: false, queueActions: false }))
      .toEqual([{ type: 'goToAlbum', itemId: 'al1' }]);
  });
});

describe('trackTarget', () => {
  it('reads a queue track', () => {
    const queued = { id: 't1', name: 'S', artist: 'X', albumId: 'al1', albumName: 'A', duration: 1, indexNumber: 1,
      artists: [{ id: 'a1', name: 'X' }] } as AudioTrack;
    expect(trackTarget(queued)).toEqual({ kind: 'track', id: 't1', albumId: 'al1', artists: [{ id: 'a1', name: 'X' }] });
  });

  it("treats the track's own id as an unknown album (trackToAudioTrack fallback)", () => {
    const queued = { id: 't1', name: 'S', artist: 'X', albumId: 't1', albumName: '', duration: 1, indexNumber: 1 } as AudioTrack;
    expect(trackTarget(queued).kind === 'track' && trackTarget(queued)).toMatchObject({ albumId: undefined });
  });

  it('reads a domain track, falling back to album artists', () => {
    const domain = { id: 't1', kind: 'track', albumId: 'al1', artists: [], albumArtists: [{ id: 'a2', name: 'Y' }] } as unknown as Track;
    expect(trackTarget(domain)).toEqual({ kind: 'track', id: 't1', albumId: 'al1', artists: [{ id: 'a2', name: 'Y' }] });
  });
});

describe('albumTarget', () => {
  it('keeps the album artists', () => {
    const album = { id: 'al1', kind: 'album', artists: [{ id: 'a1', name: 'X' }] } as unknown as Album;
    expect(albumTarget(album)).toEqual({ kind: 'album', id: 'al1', artists: [{ id: 'a1', name: 'X' }] });
  });
});
