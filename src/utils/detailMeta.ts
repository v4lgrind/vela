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

type VideoStream = { Width?: number | null; Height?: number | null; VideoRangeType?: string | null };

/** Short resolution class for a video stream ("4K", "1080p"…), judged on width first so cropped scope films keep their class. */
export function resolutionLabel(video: VideoStream | null | undefined): string | null {
  const w = video?.Width ?? 0;
  const h = video?.Height ?? 0;
  if (!w && !h) return null;
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

const HDR_LABELS: Record<string, string> = {
  HDR10: 'HDR10',
  HDR10Plus: 'HDR10+',
  HLG: 'HLG',
  DOVI: 'Dolby Vision',
};

/** HDR format worth showing next to the resolution, or null for SDR. */
export function hdrLabel(video: VideoStream | null | undefined): string | null {
  const type = video?.VideoRangeType;
  if (!type || type === 'SDR' || type === 'Unknown') return null;
  if (type.startsWith('DOVI')) return HDR_LABELS.DOVI;
  return HDR_LABELS[type] ?? 'HDR';
}

type EpisodeLike = { IndexNumber?: number | null; UserData?: { Played?: boolean; PlayedPercentage?: number | null } | null };

/** The episode a season's main button plays: one in progress, else the first unwatched, else the first. */
export function nextEpisodeOf<T extends EpisodeLike>(episodes: T[]): T | null {
  const sorted = [...episodes].sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
  const inProgress = sorted.find((ep) => !ep.UserData?.Played && (ep.UserData?.PlayedPercentage ?? 0) > 0);
  return inProgress ?? sorted.find((ep) => !ep.UserData?.Played) ?? sorted[0] ?? null;
}
