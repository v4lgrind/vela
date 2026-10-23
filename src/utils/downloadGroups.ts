import type { DownloadedMedia } from '@/services/offlineDatabase';
import type { DownloadTask } from '@/store/download-store';

/** A running download row: an album's tracks count as one row ("5 titres sur 8"). */
export interface ActiveGroup {
  key: string;
  name: string;
  done: number;
  total: number;
  progress: number;
  itemIds: string[];
}

export interface StoredGroup {
  key: string;
  kind: 'movie' | 'series' | 'album';
  name: string;
  count: number;
  size: number;
  itemIds: string[];
  imageId: string;
}

const isActive = (task: DownloadTask) => task.status === 'downloading' || task.status === 'queued';

export function groupActiveTasks(tasks: DownloadTask[]): ActiveGroup[] {
  const groups = new Map<string, DownloadTask[]>();
  for (const task of tasks) {
    if (task.status !== 'completed' && !isActive(task)) continue;
    const key = task.groupId ?? task.itemId;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.some(isActive))
    .map(([key, members]) => ({
      key,
      name: members[0].groupName ?? members[0].name,
      done: members.filter((task) => task.status === 'completed').length,
      total: members.length,
      progress: Math.round(members.reduce((sum, task) => sum + (task.status === 'completed' ? 100 : task.progress), 0) / members.length),
      itemIds: members.map((task) => task.itemId),
    }));
}

export function groupStored(downloads: DownloadedMedia[]): StoredGroup[] {
  const groups = new Map<string, StoredGroup>();
  for (const download of downloads) {
    const [key, kind, name, imageId] =
      download.type === 'Episode' && download.seriesId ? [`series:${download.seriesId}`, 'series', download.seriesName ?? download.name, download.seriesId] as const
      : download.type === 'Audio' && download.albumId ? [`album:${download.albumId}`, 'album', download.albumName ?? download.name, download.albumId] as const
      : download.type === 'Audio' ? [`track:${download.itemId}`, 'album', download.name, download.itemId] as const
      : [`movie:${download.itemId}`, 'movie', download.name, download.itemId] as const;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.size += download.fileSize || 0;
      group.itemIds.push(download.itemId);
    } else {
      groups.set(key, { key, kind, name, count: 1, size: download.fileSize || 0, itemIds: [download.itemId], imageId });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function storageByKind(downloads: DownloadedMedia[]): { movies: number; series: number; music: number; total: number } {
  const size = (type: DownloadedMedia['type'][]) =>
    downloads.filter((download) => type.includes(download.type)).reduce((sum, download) => sum + (download.fileSize || 0), 0);
  const movies = size(['Movie']);
  const series = size(['Episode']);
  const music = size(['Audio', 'MusicAlbum']);
  return { movies, series, music, total: movies + series + music };
}
