import type { ItemKind } from '@/domain';

/** Artwork shown while an image loads, fails, or does not exist; one per kind of item. */
const PLACEHOLDERS: Record<string, string> = {
  movie: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2399aa00' font-family='Arial'%3E🎬%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

  series: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2338f9d7' font-family='Arial'%3E📺%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

  episode: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112'%3E%3Crect fill='%231e1e1e' width='200' height='112'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='32' fill='%2338f9d7' font-family='Arial'%3E🎞️%3C/text%3E%3Ctext x='50%25' y='75%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

  album: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Crect fill='%231e1e1e' width='300' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2343e97b' font-family='Arial'%3E🎵%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

  audio: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'%3E%3Crect fill='%231e1e1e' width='140' height='140'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='40' fill='%2343e97b' font-family='Arial'%3E🎵%3C/text%3E%3Ctext x='50%25' y='75%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

  artist: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Crect fill='%231e1e1e' width='300' height='300'/%3E%3Ccircle cx='150' cy='120' r='44' fill='%239aa0a6'/%3E%3Cpath d='M78 240c0-42 32-70 72-70s72 28 72 70z' fill='%239aa0a6'/%3E%3C/svg%3E`,

  person: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 210'%3E%3Crect fill='%231e1e1e' width='140' height='210'/%3E%3Ccircle cx='70' cy='65' r='28' fill='%239aa0a6'/%3E%3Cellipse cx='70' cy='145' rx='40' ry='35' fill='%239aa0a6'/%3E%3C/svg%3E`,

  default: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%239aa0a6' font-family='Arial'%3E❓%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,
};

  
const PLACEHOLDER_BY_KIND: Partial<Record<ItemKind, string>> = {
  movie: 'movie',
  collection: 'movie',
  series: 'series',
  season: 'series',
  episode: 'episode',
  album: 'album',
  playlist: 'album',
  track: 'audio',
  artist: 'artist',
  person: 'person',
};

export function placeholderImage(kind?: ItemKind): string {
  return PLACEHOLDERS[PLACEHOLDER_BY_KIND[kind ?? 'other'] ?? 'default'] ?? PLACEHOLDERS.default;
}
