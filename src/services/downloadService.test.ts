import { describe, expect, it } from 'vitest';

import { buildOfflineArtworkTargets } from './downloadService';

describe('buildOfflineArtworkTargets', () => {
  it('includes episode, parent, backdrop, and cast artwork', () => {
    const targets = buildOfflineArtworkTargets({
      Id: 'episode-1',
      Type: 'Episode',
      SeriesId: 'series-1',
      SeasonId: 'season-1',
      People: [
        { Id: 'actor-1', PrimaryImageTag: 'image-tag' },
        { Id: 'actor-without-image' },
      ],
    });

    expect(targets).toEqual([
      { itemId: 'episode-1', imageType: 'Primary', maxWidth: 960 },
      { itemId: 'episode-1', imageType: 'Backdrop', maxWidth: 1920 },
      { itemId: 'series-1', imageType: 'Primary', maxWidth: 600 },
      { itemId: 'series-1', imageType: 'Backdrop', maxWidth: 1920 },
      { itemId: 'season-1', imageType: 'Primary', maxWidth: 600 },
      { itemId: 'actor-1', imageType: 'Primary', maxWidth: 400 },
    ]);
  });

  it('keeps movie artwork independent from parent-only fields', () => {
    expect(buildOfflineArtworkTargets({
      Id: 'movie-1',
      Type: 'Movie',
      SeriesId: 'ignored-series',
    })).toEqual([
      { itemId: 'movie-1', imageType: 'Primary', maxWidth: 600 },
      { itemId: 'movie-1', imageType: 'Backdrop', maxWidth: 1920 },
    ]);
  });
});
