import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { describe, it, expect, beforeEach } from 'vitest';

import { i18n, setLocale } from '@/i18n';

import { hdrLabel, heroImage, metaParts, nextEpisodeOf, resolutionLabel } from './detailMeta';

const t = i18n.global.t;

describe('metaParts', () => {
  beforeEach(() => setLocale('en'));

  it('shows a season year once, then its episode count', () => {
    const season = { Type: 'Season', ProductionYear: 2022, PremiereDate: '2022-09-21', ChildCount: 12 } as BaseItemDto;
    expect(metaParts(season, t)).toEqual(['2022', '12 episodes']);
  });

  it('shows year and runtime for a movie', () => {
    const movie = { Type: 'Movie', ProductionYear: 2022, RunTimeTicks: 4380 * 10_000_000 } as BaseItemDto;
    expect(metaParts(movie, t)).toEqual(['2022', '1h 13m']);
  });

  it('falls back to the premiere year', () => {
    expect(metaParts({ Type: 'Series', PremiereDate: '2019-04-01' } as BaseItemDto, t)).toEqual(['2019']);
  });
});

describe('heroImage', () => {
  it('uses the series backdrop for a season instead of its poster', () => {
    const season = { Type: 'Season', Id: 's1', SeriesId: 'x', ParentBackdropItemId: 'x', ParentBackdropImageTags: ['t'] } as BaseItemDto;
    expect(heroImage(season)).toEqual({ itemId: 'x', type: 'Backdrop' });
  });

  it('falls back to the season poster when the series has no backdrop', () => {
    const season = { Type: 'Season', Id: 's1', SeriesId: 'x', ParentBackdropImageTags: [] } as BaseItemDto;
    expect(heroImage(season)).toEqual({ itemId: 's1', type: 'Primary' });
  });

  it('uses the item backdrop when it has one, else its primary image', () => {
    expect(heroImage({ Type: 'Movie', Id: 'm', BackdropImageTags: ['t'] } as BaseItemDto)).toEqual({ itemId: 'm', type: 'Backdrop' });
    expect(heroImage({ Type: 'Movie', Id: 'm', BackdropImageTags: [] } as BaseItemDto)).toEqual({ itemId: 'm', type: 'Primary' });
  });
});

describe('resolutionLabel', () => {
  it('names the usual classes', () => {
    expect(resolutionLabel({ Width: 3840, Height: 2160 })).toBe('4K');
    expect(resolutionLabel({ Width: 1920, Height: 800 })).toBe('1080p');
    expect(resolutionLabel({ Width: 1280, Height: 720 })).toBe('720p');
    expect(resolutionLabel({ Width: 720, Height: 576 })).toBe('SD');
    expect(resolutionLabel(null)).toBeNull();
  });
});

describe('hdrLabel', () => {
  it('shows HDR formats and hides SDR', () => {
    expect(hdrLabel({ VideoRangeType: 'HDR10' })).toBe('HDR10');
    expect(hdrLabel({ VideoRangeType: 'DOVIWithHDR10' })).toBe('Dolby Vision');
    expect(hdrLabel({ VideoRangeType: 'SDR' })).toBeNull();
    expect(hdrLabel({})).toBeNull();
  });
});

describe('nextEpisodeOf', () => {
  const ep = (n: number, played = false, pct = 0) => ({ IndexNumber: n, UserData: { Played: played, PlayedPercentage: pct } });

  it('prefers the episode in progress', () => {
    expect(nextEpisodeOf([ep(1, true), ep(3), ep(2, false, 40)])?.IndexNumber).toBe(2);
  });

  it('falls back to the first unwatched, then the first', () => {
    expect(nextEpisodeOf([ep(2), ep(1, true)])?.IndexNumber).toBe(2);
    expect(nextEpisodeOf([ep(2, true), ep(1, true)])?.IndexNumber).toBe(1);
    expect(nextEpisodeOf([])).toBeNull();
  });
});
