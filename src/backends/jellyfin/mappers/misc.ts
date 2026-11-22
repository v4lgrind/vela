import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models/chapter-info';
import type { LyricDto } from '@jellyfin/sdk/lib/generated-client/models/lyric-dto';
import type { MediaSegmentDto } from '@jellyfin/sdk/lib/generated-client/models/media-segment-dto';

import type { Chapter, Library, LibraryKind, Lyrics, Marker, MarkerKind } from '@/domain';

import { opt, ticksToMs } from './common';
import { itemImages } from './images';

const LIBRARY_KIND_BY_COLLECTION: Record<string, LibraryKind> = {
  movies: 'movies',
  tvshows: 'shows',
  music: 'music',
  mixed: 'mixed',
};

const MARKER_KIND_BY_SEGMENT: Record<string, MarkerKind> = {
  Intro: 'intro',
  Outro: 'credits',
  Recap: 'recap',
  Preview: 'preview',
};

/** A user view. Views without a collection type are mixed folders. */
export function toLibrary(view: BaseItemDto): Library {
  const collection = view.CollectionType ?? 'mixed';
  return {
    id: view.Id ?? '',
    title: view.Name ?? '',
    kind: LIBRARY_KIND_BY_COLLECTION[collection] ?? 'other',
    images: itemImages(view),
  };
}

export function toMarkers(segments: MediaSegmentDto[]): Marker[] {
  return segments.flatMap((segment) => {
    const kind = MARKER_KIND_BY_SEGMENT[segment.Type ?? ''];
    const startMs = ticksToMs(segment.StartTicks);
    const endMs = ticksToMs(segment.EndTicks);
    if (!kind || startMs === undefined || endMs === undefined) return [];
    return [{ kind, startMs, endMs }];
  });
}

/** Jellyfin chapters only carry a start; each ends where the next begins. */
export function toChapters(chapters: ChapterInfo[], durationMs?: number): Chapter[] {
  const starts = chapters.map((chapter) => ticksToMs(chapter.StartPositionTicks) ?? 0);
  return chapters.map((chapter, i) => ({
    title: opt(chapter.Name),
    startMs: starts[i],
    endMs: starts[i + 1] ?? durationMs,
  }));
}

export function toLyrics(dto: LyricDto): Lyrics | null {
  const lines = (dto.Lyrics ?? []).map((line) => ({
    text: line.Text ?? '',
    startMs: line.Start == null ? null : (ticksToMs(line.Start) ?? null),
  }));
  if (!lines.length) return null;
  return { synced: lines.every((line) => line.startMs !== null), lines };
}
