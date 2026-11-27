import { describe, expect, it } from 'vitest';

import type { Track } from '@/domain';

import { musicCharts } from './musicCharts';

function track(id: string, plays: number, album: [string, string], artist?: [string, string]): Track {
  const artists = artist ? [{ id: artist[0], name: artist[1] }] : [];
  return {
    id, kind: 'track', title: id, albumId: album[0], albumTitle: album[1], albumArtist: artist?.[1],
    artists, albumArtists: artists, images: { poster: `cover-${album[0]}` },
    user: { played: plays > 0, playCount: plays, favorite: false }, versions: [],
  } as unknown as Track;
}

const daft: [string, string] = ['a1', 'Daft Punk'];
const muse: [string, string] = ['a2', 'Muse'];
const tracks = [
  track('t1', 10, ['al1', 'Discovery'], daft),
  track('t2', 3, ['al2', 'Absolution'], muse),
  track('t3', 4, ['al2', 'Absolution'], muse),
  track('t4', 2, ['al1', 'Discovery'], daft),
];

describe('musicCharts', () => {
  it('ranks tracks by plays', () => {
    expect(musicCharts(tracks).tracks.map((t) => t.id)).toEqual(['t1', 't3', 't2', 't4']);
  });

  it('adds up the plays of an album', () => {
    expect(musicCharts(tracks).albums).toEqual([
      { id: 'al1', title: 'Discovery', artist: 'Daft Punk', plays: 12, cover: 'cover-al1' },
      { id: 'al2', title: 'Absolution', artist: 'Muse', plays: 7, cover: 'cover-al2' },
    ]);
  });

  it('adds up the plays of an artist', () => {
    expect(musicCharts(tracks).artists).toEqual([
      { id: 'a1', name: 'Daft Punk', plays: 12 },
      { id: 'a2', name: 'Muse', plays: 7 },
    ]);
  });

  it('skips unplayed tracks and items without id', () => {
    const charts = musicCharts([track('t9', 0, ['al9', 'X'], daft), track('t8', 5, ['', ''])]);
    expect(charts.tracks.map((t) => t.id)).toEqual(['t8']);
    expect(charts.albums).toEqual([]);
    expect(charts.artists).toEqual([]);
  });

  it('keeps 10 artists, 10 albums and 25 tracks', () => {
    const many = Array.from({ length: 40 }, (_, i) => track(`t${i}`, 40 - i, [`al${i}`, `A${i}`], [`a${i}`, `N${i}`]));
    const charts = musicCharts(many);
    expect([charts.artists.length, charts.albums.length, charts.tracks.length]).toEqual([10, 10, 25]);
  });
});
