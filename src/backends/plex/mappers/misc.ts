import type { Chapter, Library, LibraryKind, Marker, MarkerKind } from '@/domain';

import type { PlexChapter, PlexDirectory, PlexMarker } from '../types';

const LIBRARY_KIND_BY_TYPE: Record<string, LibraryKind> = {
  movie: 'movies',
  show: 'shows',
  artist: 'music',
};

const MARKER_KIND_BY_TYPE: Record<string, MarkerKind> = {
  intro: 'intro',
  credits: 'credits',
};

export function toLibrary(section: PlexDirectory): Library {
  const images = { poster: section.thumb, backdrop: section.art };
  return {
    id: section.key,
    title: section.title,
    kind: LIBRARY_KIND_BY_TYPE[section.type] ?? 'other',
    images: Object.fromEntries(Object.entries(images).filter(([, ref]) => ref)),
  };
}

/** Plex markers are already in ms; commercials are dropped. */
export function toMarkers(markers: PlexMarker[] | undefined): Marker[] {
  return (markers ?? []).flatMap((marker) => {
    const kind = MARKER_KIND_BY_TYPE[marker.type];
    return kind ? [{ kind, startMs: marker.startTimeOffset, endMs: marker.endTimeOffset }] : [];
  });
}

export function toChapters(chapters: PlexChapter[] | undefined): Chapter[] {
  return (chapters ?? []).map((chapter) => ({
    title: chapter.tag,
    startMs: chapter.startTimeOffset,
    endMs: chapter.endTimeOffset,
  }));
}
