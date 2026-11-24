import type { Chapter, Library, LibraryKind, Lyrics, Marker, MarkerKind, Person } from '@/domain';

import type { PlexChapter, PlexDirectory, PlexMarker, PlexTag } from '../types';

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

/** `GET /library/people/{id}`: a tag with a name and a photo, no biography. */
export function toPerson(tag: PlexTag): Person {
  return {
    id: String(tag.id ?? ''),
    kind: 'person',
    title: tag.tag,
    genres: [],
    studios: [],
    images: tag.thumb ? { poster: tag.thumb } : {},
    user: { played: false, playCount: 0, favorite: false },
  };
}

const LRC_LINE = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;

/** Lyrics file of a track (`/library/streams/{id}`): LRC is time-synced, anything else is plain text. */
export function toLyrics(text: string, codec: string): Lyrics {
  const rows = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (codec.toLowerCase() !== 'lrc') return { synced: false, lines: rows.map((row) => ({ startMs: null, text: row })) };
  const lines = rows.flatMap((row) => {
    const match = LRC_LINE.exec(row);
    return match ? [{ startMs: Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000), text: match[3].trim() }] : [];
  });
  return { synced: true, lines };
}
