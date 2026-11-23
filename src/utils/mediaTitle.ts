import type { MediaItem } from '@/domain';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Human-readable player title for an item.
 * Episodes render as "Series · S01E02 · Episode name".
 */
export function buildMediaTitle(item: MediaItem | null | undefined): string {
    if (!item) return '';
    if (item.kind !== 'episode') return item.title;
    const { seasonNumber: season, episodeNumber: episode } = item;
    const code = season != null && episode != null ? `S${pad(season)}E${pad(episode)}` : null;
    return [item.seriesTitle, code, item.title].filter(Boolean).join(' · ');
}
