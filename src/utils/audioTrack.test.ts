import { describe, expect, it } from 'vitest';

import type { Track } from '@/domain';

import { trackToAudioTrack } from './audioTrack';

const track = {
  id: 't1', kind: 'track', title: 'Song', artists: [], albumArtists: [], genres: [], studios: [], images: {},
  user: { played: false, playCount: 0, favorite: false },
  versions: [{ id: 'v1', streamRef: '/library/parts/1/2/file.flac', video: [], audio: [], subtitles: [] }],
} as unknown as Track;

describe('trackToAudioTrack', () => {
  it('keeps the file locator so the queue can stream the file directly', () => {
    expect(trackToAudioTrack(track).streamRef).toBe('/library/parts/1/2/file.flac');
  });

  it('has no locator for servers that do not give one', () => {
    expect(trackToAudioTrack({ ...track, versions: [] } as Track).streamRef).toBeUndefined();
  });

  it('keeps the track artists that have an id', () => {
    const t = { ...track, artists: [{ id: 'a1', name: 'Daft Punk' }, { name: 'Sans id' }] } as Track;
    expect(trackToAudioTrack(t).artists).toEqual([{ id: 'a1', name: 'Daft Punk' }]);
  });

  it('falls back to the album artists', () => {
    const t = { ...track, artists: [], albumArtists: [{ id: 'a2', name: 'X' }] } as unknown as Track;
    expect(trackToAudioTrack(t).artists).toEqual([{ id: 'a2', name: 'X' }]);
  });
});
