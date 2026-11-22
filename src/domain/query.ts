import type { Episode, ItemKind, MediaItem } from './media';

export type LibraryView = 'items' | 'artists' | 'albums' | 'tracks' | 'playlists';

export type SortField = 'title' | 'dateAdded' | 'year' | 'rating' | 'random';

export interface LibraryQuery {
  view: LibraryView;
  sort: { by: SortField; order: 'asc' | 'desc' };
  filter: {
    unplayed?: boolean;
    favorites?: boolean;
    genres?: string[];
    /** First letter of the sort title; '#' for non-letters. */
    letter?: string;
  };
  offset: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface SearchQuery {
  term: string;
  kinds?: ItemKind[];
  limit?: number;
}

export interface HomeSections {
  continueWatching: MediaItem[];
  nextUp: Episode[];
  /** Latest additions keyed by library id. */
  latestByLibrary: Record<string, MediaItem[]>;
}
