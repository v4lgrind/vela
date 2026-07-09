/**
 * Human-readable player title for a Jellyfin item.
 * Episodes render as "Series · S01E02 · Episode name".
 */
export function buildMediaTitle(item: any): string {
    if (!item) return '';
    if (item.Type === 'Episode') {
        const series = item.SeriesName || '';
        const season = item.ParentIndexNumber != null ? item.ParentIndexNumber : null;
        const episode = item.IndexNumber != null ? item.IndexNumber : null;
        const epName = item.Name || '';
        const code = season != null && episode != null
            ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : null;
        return [series, code, epName].filter(Boolean).join(' · ');
    }
    return item.Name || '';
}
