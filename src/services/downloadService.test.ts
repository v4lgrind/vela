import { describe, expect, it } from 'vitest';

import type { MediaItem } from '@/domain';

import { buildOfflineArtworkTargets } from './downloadService';

const user = { played: false, playCount: 0, favorite: false };
const base = { genres: [], studios: [], user, versions: [], credits: [] };

describe('buildOfflineArtworkTargets', () => {
  it('includes episode still, series art and cast portraits', () => {
    const episode = {
      ...base, id: 'episode-1', kind: 'episode', title: 'E', seriesId: 'series-1', seriesTitle: 'S', seasonId: 'season-1',
      images: { thumb: 'still', poster: 'series-poster', backdrop: 'series-backdrop' },
      credits: [
        { personId: 'actor-1', name: 'A', role: 'actor', image: 'portrait' },
        { personId: 'actor-without-image', name: 'B', role: 'actor' },
      ],
    } as MediaItem;

    expect(buildOfflineArtworkTargets(episode)).toEqual([
      { itemId: 'episode-1', imageType: 'Primary', ref: 'still', maxWidth: 960 },
      { itemId: 'series-1', imageType: 'Primary', ref: 'series-poster', maxWidth: 600 },
      { itemId: 'series-1', imageType: 'Backdrop', ref: 'series-backdrop', maxWidth: 1920 },
      { itemId: 'actor-1', imageType: 'Primary', ref: 'portrait', maxWidth: 400 },
    ]);
  });

  it('caches a movie poster and backdrop, skipping missing images', () => {
    const movie = { ...base, id: 'movie-1', kind: 'movie', title: 'M', images: { poster: 'p' } } as MediaItem;
    expect(buildOfflineArtworkTargets(movie)).toEqual([{ itemId: 'movie-1', imageType: 'Primary', ref: 'p', maxWidth: 600 }]);
  });

  it('caches the album cover of a track under the album id', () => {
    const track = { ...base, id: 't', kind: 'track', title: 'T', albumId: 'al', artists: [], albumArtists: [], images: { poster: 'cover' } } as MediaItem;
    expect(buildOfflineArtworkTargets(track)).toContainEqual({ itemId: 'al', imageType: 'Primary', ref: 'cover', maxWidth: 600 });
  });
});
