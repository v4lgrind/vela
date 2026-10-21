import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { describe, it, expect, beforeEach } from 'vitest';

import { i18n, setLocale } from '@/i18n';

import { heroImage, metaParts } from './detailMeta';

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
    const season = { Type: 'Season', Id: 's1', SeriesId: 'x', ParentBackdropItemId: 'x' } as BaseItemDto;
    expect(heroImage(season)).toEqual({ itemId: 'x', type: 'Backdrop' });
  });

  it('uses the item backdrop when it has one, else its primary image', () => {
    expect(heroImage({ Type: 'Movie', Id: 'm', BackdropImageTags: ['t'] } as BaseItemDto)).toEqual({ itemId: 'm', type: 'Backdrop' });
    expect(heroImage({ Type: 'Movie', Id: 'm', BackdropImageTags: [] } as BaseItemDto)).toEqual({ itemId: 'm', type: 'Primary' });
  });
});
