import type { Marker, MarkerKind, MediaItem } from '@/domain';
import type { DownloadedMedia, StoredDownload } from '@/services/offlineDatabase';

const TICKS_PER_MS = 10_000;
const MARKER_KIND: Record<string, MarkerKind> = { Intro: 'intro', Outro: 'credits' };

function legacyMarkers(segments: StoredDownload['introSegments']): Marker[] {
  return (segments ?? []).flatMap((segment) => {
    const kind = MARKER_KIND[segment.Type];
    return kind ? [{ kind, startMs: segment.StartTicks / TICKS_PER_MS, endMs: segment.EndTicks / TICKS_PER_MS }] : [];
  });
}

/** A record lacking nothing the app needs is already normalized. */
export function needsNormalizing(stored: StoredDownload): boolean {
  return !stored.item || !stored.serverId || !stored.markers;
}

/**
 * Turns any stored record into a `DownloadedMedia`. Pre-domain records only
 * carry the Jellyfin DTO: it is decoded once (`decode`), their segments become
 * markers, and they are attributed to `fallbackServerId` (the account active
 * when they are first read). The legacy fields are left untouched.
 */
export function normalizeDownload(
  stored: StoredDownload,
  decode: (raw: unknown) => MediaItem,
  fallbackServerId: string,
): DownloadedMedia {
  return {
    ...stored,
    item: stored.item ?? decode(stored.jellyfinItem ?? { Id: stored.itemId, Name: stored.name }),
    serverId: stored.serverId ?? fallbackServerId,
    markers: stored.markers ?? legacyMarkers(stored.introSegments),
  };
}
