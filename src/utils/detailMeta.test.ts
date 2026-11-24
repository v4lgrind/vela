import { describe, it, expect, beforeEach } from 'vitest';

import type { Episode, MediaItem } from '@/domain';
import { i18n, setLocale } from '@/i18n';

import { hdrLabel, metaParts, nextEpisodeOf, resolutionLabel } from './detailMeta';

const t = i18n.global.t;
const user = { played: false, playCount: 0, favorite: false };
const base = { id: 'x', title: 'x', genres: [], studios: [], images: {}, user };

describe('metaParts', () => {
  beforeEach(() => setLocale('en'));

  it('shows a season year once, then its episode count', () => {
    const season = { ...base, kind: 'season', year: 2022, premiereDate: '2022-09-21', episodeCount: 12, seriesId: 's', seriesTitle: 'S' };
    expect(metaParts(season as MediaItem, t)).toEqual(['2022', '12 episodes']);
  });

  it('shows year and runtime for a movie', () => {
    const movie = { ...base, kind: 'movie', year: 2022, durationMs: 4380 * 1000, versions: [], credits: [] };
    expect(metaParts(movie as MediaItem, t)).toEqual(['2022', '1h 13m']);
  });

  it('falls back to the premiere year', () => {
    expect(metaParts({ ...base, kind: 'series', premiereDate: '2019-04-01', credits: [] } as MediaItem, t)).toEqual(['2019']);
  });
});

describe('resolutionLabel', () => {
  it('names the usual classes', () => {
    expect(resolutionLabel({ width: 3840, height: 2160 })).toBe('4K');
    expect(resolutionLabel({ width: 1920, height: 800 })).toBe('1080p');
    expect(resolutionLabel({ width: 1280, height: 720 })).toBe('720p');
    expect(resolutionLabel({ width: 720, height: 576 })).toBe('SD');
    expect(resolutionLabel(null)).toBeNull();
  });
});

describe('hdrLabel', () => {
  it('shows HDR formats and hides SDR', () => {
    expect(hdrLabel({ range: 'hdr10' })).toBe('HDR10');
    expect(hdrLabel({ range: 'dolby-vision' })).toBe('Dolby Vision');
    expect(hdrLabel({ range: 'sdr' })).toBeNull();
    expect(hdrLabel({ range: 'unknown' })).toBeNull();
    expect(hdrLabel(undefined)).toBeNull();
  });
});

describe('nextEpisodeOf', () => {
  const ep = (n: number, played = false, resumePositionMs?: number) =>
    ({ ...base, kind: 'episode', episodeNumber: n, user: { ...user, played, resumePositionMs } }) as unknown as Episode;

  it('prefers the episode in progress', () => {
    expect(nextEpisodeOf([ep(1, true), ep(3), ep(2, false, 40_000)])?.episodeNumber).toBe(2);
  });

  it('falls back to the first unwatched, then the first', () => {
    expect(nextEpisodeOf([ep(2), ep(1, true)])?.episodeNumber).toBe(2);
    expect(nextEpisodeOf([ep(2, true), ep(1, true)])?.episodeNumber).toBe(1);
    expect(nextEpisodeOf([])).toBeNull();
  });
});
