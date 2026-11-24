import type { ItemKind } from './media';

export type LibraryView = 'items' | 'artists' | 'albums' | 'tracks' | 'playlists';

export type SortField = 'title' | 'releaseDate' | 'dateAdded' | 'rating' | 'playCount' | 'random';

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
