import { describe, it, expect } from 'vitest';

import { pickLibraryId } from './libraryOf';

describe('pickLibraryId', () => {
  const ancestors = [
    { Id: 'album', Type: 'MusicAlbum' },
    { Id: 'books', Type: 'CollectionFolder' },
    { Id: 'music', Type: 'CollectionFolder' },
    { Id: 'root', Type: 'UserRootFolder' },
  ];

  it('prefers a known library ancestor', () => {
    expect(pickLibraryId(ancestors, ['music', 'films'])).toBe('music');
  });

  it('falls back to the collection folder', () => {
    expect(pickLibraryId(ancestors, ['films'])).toBe('books');
  });

  it('returns undefined without one', () => {
    expect(pickLibraryId([{ Id: 'album', Type: 'MusicAlbum' }], ['films'])).toBeUndefined();
  });
});
