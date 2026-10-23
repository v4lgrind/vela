import { describe, it, expect } from 'vitest';

import type { DownloadedMedia } from '@/services/offlineDatabase';
import type { DownloadTask } from '@/store/download-store';

import { groupActiveTasks, groupStored, storageByKind } from './downloadGroups';

const task = (itemId: string, status: DownloadTask['status'], over: Partial<DownloadTask> = {}): DownloadTask => ({
  itemId, name: itemId, type: 'Audio', progress: status === 'completed' ? 100 : 40, loaded: 0, total: 0, status, startedAt: 0, ...over,
});

const dl = (itemId: string, type: DownloadedMedia['type'], fileSize: number, over: Partial<DownloadedMedia> = {}): DownloadedMedia => ({
  itemId, type, name: itemId, filePath: itemId, fileSize, downloadDate: 0, jellyfinItem: {}, ...over,
});

describe('groupActiveTasks', () => {
  it("groups an album's tasks into one row", () => {
    const album = { groupId: 'al1', groupName: 'Plague' };
    const tasks = [
      ...['a', 'b', 'c', 'd', 'e'].map((id) => task(id, 'completed', album)),
      task('f', 'downloading', album), task('g', 'queued', { ...album, progress: 0 }), task('h', 'queued', { ...album, progress: 0 }),
      task('movie', 'downloading', { type: 'Movie', name: 'Dune', progress: 42 }),
    ];
    expect(groupActiveTasks(tasks)).toEqual([
      { key: 'al1', name: 'Plague', done: 5, total: 8, progress: 68, itemIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      { key: 'movie', name: 'Dune', done: 0, total: 1, progress: 42, itemIds: ['movie'] },
    ]);
  });

  it('drops groups with nothing left to download', () => {
    expect(groupActiveTasks([task('a', 'completed', { groupId: 'al1' }), task('b', 'failed')])).toEqual([]);
  });
});

describe('groupStored', () => {
  it('groups stored episodes by series and tracks by album', () => {
    const downloads = [
      dl('e1', 'Episode', 100, { seriesId: 's1', seriesName: 'MobLand' }),
      dl('e2', 'Episode', 200, { seriesId: 's1', seriesName: 'MobLand' }),
      dl('t1', 'Audio', 10, { albumId: 'al1', albumName: 'Plague' }),
      dl('t2', 'Audio', 20, { albumId: 'al1', albumName: 'Plague' }),
      dl('loose', 'Audio', 5, { name: 'Demo' }),
      dl('m1', 'Movie', 1000, { name: 'Hellraiser' }),
    ];
    expect(groupStored(downloads)).toEqual([
      { key: 'track:loose', kind: 'album', name: 'Demo', count: 1, size: 5, itemIds: ['loose'], imageId: 'loose' },
      { key: 'movie:m1', kind: 'movie', name: 'Hellraiser', count: 1, size: 1000, itemIds: ['m1'], imageId: 'm1' },
      { key: 'series:s1', kind: 'series', name: 'MobLand', count: 2, size: 300, itemIds: ['e1', 'e2'], imageId: 's1' },
      { key: 'album:al1', kind: 'album', name: 'Plague', count: 2, size: 30, itemIds: ['t1', 't2'], imageId: 'al1' },
    ]);
  });
});

describe('storageByKind', () => {
  it('sums storage by kind', () => {
    const downloads = [dl('m', 'Movie', 1000), dl('e', 'Episode', 300), dl('t', 'Audio', 30), dl('t2', 'Audio', 0)];
    expect(storageByKind(downloads)).toEqual({ movies: 1000, series: 300, music: 30, total: 1330 });
  });
});
