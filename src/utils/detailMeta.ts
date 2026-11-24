import type { Episode, MediaItem, VideoRange, VideoStream } from '@/domain';
import { formatDuration } from '@/i18n/format';

type Translate = (key: string, plural: number) => string;

const MS_PER_SECOND = 1000;

function itemYear(item: MediaItem): number | null {
  if (item.year) return item.year;
  return item.premiereDate ? new Date(item.premiereDate).getFullYear() : null;
}

/** Meta line under a detail title: year, then episode count (season) or runtime; never twice the same entry. */
export function metaParts(item: MediaItem, t: Translate, episodeCount?: number): string[] {
  const parts: string[] = [];
  const year = itemYear(item);
  if (year) parts.push(String(year));
  if (item.kind === 'season') {
    const count = episodeCount ?? item.episodeCount ?? 0;
    if (count) parts.push(t('detail.episodes', count));
  } else if (item.durationMs) {
    parts.push(formatDuration(Math.floor(item.durationMs / MS_PER_SECOND)));
  }
  return [...new Set(parts)];
}

type Resolution = Pick<VideoStream, 'width' | 'height'>;

/** Short resolution class for a video stream ("4K", "1080p"…), judged on width first so cropped scope films keep their class. */
export function resolutionLabel(video: Resolution | null | undefined): string | null {
  const w = video?.width ?? 0;
  const h = video?.height ?? 0;
  if (!w && !h) return null;
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

const HDR_LABELS: Partial<Record<VideoRange, string>> = {
  hdr10: 'HDR10',
  'hdr10+': 'HDR10+',
  hlg: 'HLG',
  'dolby-vision': 'Dolby Vision',
};

/** HDR format worth showing next to the resolution, or null for SDR / unknown. */
export function hdrLabel(video: Pick<VideoStream, 'range'> | null | undefined): string | null {
  return (video && HDR_LABELS[video.range]) ?? null;
}

/** The episode a season's main button plays: one in progress, else the first unwatched, else the first. */
export function nextEpisodeOf(episodes: Episode[]): Episode | null {
  const sorted = [...episodes].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
  const inProgress = sorted.find((ep) => !ep.user.played && (ep.user.resumePositionMs ?? 0) > 0);
  return inProgress ?? sorted.find((ep) => !ep.user.played) ?? sorted[0] ?? null;
}
