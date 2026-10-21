import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import { formatDuration } from '@/i18n/format';

type Translate = (key: string, plural: number) => string;

function itemYear(item: BaseItemDto): number | null {
  if (item.ProductionYear) return item.ProductionYear;
  return item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null;
}

/** Meta line under a detail title: year, then episode count (season) or runtime; never twice the same entry. */
export function metaParts(item: BaseItemDto, t: Translate, episodeCount = item.ChildCount ?? 0): string[] {
  const parts: string[] = [];
  const year = itemYear(item);
  if (year) parts.push(String(year));
  if (item.Type === 'Season') {
    if (episodeCount) parts.push(t('detail.episodes', episodeCount));
  } else if (item.RunTimeTicks) {
    parts.push(formatDuration(Math.floor(item.RunTimeTicks / 10_000_000)));
  }
  return [...new Set(parts)];
}

/** Image behind a detail hero: seasons and episodes borrow the series backdrop. */
export function heroImage(item: BaseItemDto): { itemId: string; type: 'Backdrop' | 'Primary' } {
  // Episodes always asked the series for a backdrop; a season only does when the series has one,
  // otherwise its own poster beats a 404.
  if (item.Type === 'Episode' || (item.Type === 'Season' && item.ParentBackdropImageTags?.length)) {
    const parent = item.ParentBackdropItemId || item.SeriesId;
    if (parent) return { itemId: parent, type: 'Backdrop' };
  }
  if (item.BackdropImageTags?.length) return { itemId: item.Id!, type: 'Backdrop' };
  return { itemId: item.Id!, type: 'Primary' };
}
