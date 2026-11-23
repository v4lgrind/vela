import { describe, expect, it } from 'vitest';

import type { MediaItem } from '@/domain';
import type { StoredDownload } from '@/services/offlineDatabase';

import { needsNormalizing, normalizeDownload } from './offlineRecords';

const user = { played: false, playCount: 0, favorite: false };
const decoded = { id: 'm1', kind: 'movie', title: 'Dune', genres: [], studios: [], images: {}, user, versions: [], credits: [] } as MediaItem;
const decode = (raw: unknown) => ({ ...decoded, title: (raw as { Name: string }).Name });

const legacy: StoredDownload = {
  itemId: 'm1', type: 'Movie', name: 'Dune', filePath: 'content://dune', fileSize: 1, downloadDate: 0,
  jellyfinItem: { Id: 'm1', Name: 'Dune (2021)' },
  introSegments: [
    { Type: 'Intro', StartTicks: 0, EndTicks: 300_000_000 },
    { Type: 'Outro', StartTicks: 50_000_000_000, EndTicks: 52_000_000_000 },
    { Type: 'Commercial', StartTicks: 1, EndTicks: 2 },
  ],
};

describe('normalizeDownload', () => {
  it('decodes pre-domain records once and converts their segments to markers', () => {
    expect(needsNormalizing(legacy)).toBe(true);
    const media = normalizeDownload(legacy, decode, 'srv');
    expect(media.item.title).toBe('Dune (2021)');
    expect(media.serverId).toBe('srv');
    expect(media.markers).toEqual([
      { kind: 'intro', startMs: 0, endMs: 30_000 },
      { kind: 'credits', startMs: 5_000_000, endMs: 5_200_000 },
    ]);
    // The legacy DTO stays on the record until a later release drops it.
    expect((media as StoredDownload).jellyfinItem).toEqual(legacy.jellyfinItem);
  });

  it('keeps records written by the current schema as they are', () => {
    const current: StoredDownload = { ...legacy, jellyfinItem: undefined, introSegments: undefined, item: decoded, serverId: 'plex-1', markers: [] };
    expect(needsNormalizing(current)).toBe(false);
    expect(normalizeDownload(current, () => { throw new Error('no decode'); }, 'other')).toMatchObject({ serverId: 'plex-1', item: decoded });
  });
});
