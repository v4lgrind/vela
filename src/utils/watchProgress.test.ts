import { describe, it, expect } from 'vitest';

import type { DownloadedMedia, WatchProgress } from '@/services/offlineDatabase';

import { effectiveProgress, offlineResumeSeconds, resumeCandidates, shouldPushLocal } from './watchProgress';

const JAN_1 = Date.parse('2026-01-01T10:00:00Z');
const JAN_2 = Date.parse('2026-01-02T10:00:00Z');

const local = (over: Partial<WatchProgress> = {}): WatchProgress => ({
  itemId: 'e1', position: 1200, duration: 3000, percentage: 40, completed: false, lastWatched: JAN_2, synced: false, ...over,
});

const serverItem = (userData: Record<string, any>) => ({ Id: 'e1', UserData: userData });

describe('effectiveProgress', () => {
  it('uses the server data when it is newer', () => {
    const item = serverItem({ PlaybackPositionTicks: 600 * 1e7, PlayedPercentage: 20, Played: false, LastPlayedDate: '2026-01-03T10:00:00Z' });
    expect(effectiveProgress(item, local())).toEqual({ position: 600, percentage: 20, played: false, lastPlayed: Date.parse('2026-01-03T10:00:00Z') });
  });

  it('uses local progress when it is newer', () => {
    const item = serverItem({ PlaybackPositionTicks: 600 * 1e7, PlayedPercentage: 20, LastPlayedDate: '2026-01-01T10:00:00Z' });
    expect(effectiveProgress(item, local())).toEqual({ position: 1200, percentage: 40, played: false, lastPlayed: JAN_2 });
  });

  it('local wins on equal dates', () => {
    const item = serverItem({ PlaybackPositionTicks: 600 * 1e7, PlayedPercentage: 20, LastPlayedDate: '2026-01-02T10:00:00Z' });
    expect(effectiveProgress(item, local()).position).toBe(1200);
  });

  it('reads the server data alone when nothing was played offline', () => {
    const item = serverItem({ PlaybackPositionTicks: 300 * 1e7, PlayedPercentage: 10, Played: false });
    expect(effectiveProgress(item)).toEqual({ position: 300, percentage: 10, played: false, lastPlayed: 0 });
  });
});

describe('shouldPushLocal', () => {
  it('pushes local when the server has no date', () => {
    expect(shouldPushLocal(local(), { LastPlayedDate: null })).toBe(true);
    expect(shouldPushLocal(local(), undefined)).toBe(true);
  });

  it('keeps the server when its date is newer', () => {
    expect(shouldPushLocal(local({ lastWatched: JAN_1 }), { LastPlayedDate: '2026-01-02T10:00:00Z' })).toBe(false);
  });

  it('pushes local on equal or older server dates', () => {
    expect(shouldPushLocal(local(), { LastPlayedDate: '2026-01-02T10:00:00Z' })).toBe(true);
    expect(shouldPushLocal(local(), { LastPlayedDate: '2026-01-01T10:00:00Z' })).toBe(true);
  });
});

describe('resumeCandidates', () => {
  const dl = (id: string, type: DownloadedMedia['type'], userData: Record<string, any> = {}): DownloadedMedia => ({
    itemId: id, type, name: id, filePath: id, fileSize: 1, downloadDate: 0, jellyfinItem: { Id: id, Type: type, UserData: userData },
  });

  it('resume lists started videos under 90 %, newest first', () => {
    const downloads = [
      dl('older', 'Movie', { PlaybackPositionTicks: 100 * 1e7, PlayedPercentage: 10, LastPlayedDate: '2026-01-01T10:00:00Z' }),
      dl('newer', 'Episode'),
      dl('almostDone', 'Movie', { PlaybackPositionTicks: 2900 * 1e7, PlayedPercentage: 95, LastPlayedDate: '2026-01-05T10:00:00Z' }),
      dl('unstarted', 'Movie', { PlaybackPositionTicks: 0, PlayedPercentage: 0 }),
      dl('song', 'Audio', { PlaybackPositionTicks: 50 * 1e7, PlayedPercentage: 30, LastPlayedDate: '2026-01-06T10:00:00Z' }),
    ];
    const progress = new Map([['newer', local({ itemId: 'newer' })]]);
    expect(resumeCandidates(downloads, progress).map((c) => c.media.itemId)).toEqual(['newer', 'older']);
  });

  it('skips videos marked played', () => {
    const downloads = [dl('seen', 'Movie', { PlaybackPositionTicks: 100 * 1e7, PlayedPercentage: 10, Played: true })];
    expect(resumeCandidates(downloads, new Map())).toEqual([]);
  });
});

describe('offlineResumeSeconds', () => {
  it('resumes at the newer server position over an older local one', () => {
    const item = serverItem({ PlaybackPositionTicks: 2400 * 1e7, PlayedPercentage: 50, LastPlayedDate: '2026-01-05T10:00:00Z' });
    expect(offlineResumeSeconds(item, local({ position: 300, lastWatched: JAN_1 }))).toBe(2400);
  });

  it('resumes at the newer local position', () => {
    const item = serverItem({ PlaybackPositionTicks: 600 * 1e7, PlayedPercentage: 20, LastPlayedDate: '2026-01-01T10:00:00Z' });
    expect(offlineResumeSeconds(item, local())).toBe(1200);
  });

  it('starts over a video finished on another device', () => {
    const item = serverItem({ PlaybackPositionTicks: 0, PlayedPercentage: 100, Played: true, LastPlayedDate: '2026-01-05T10:00:00Z' });
    expect(offlineResumeSeconds(item, local({ lastWatched: JAN_1 }))).toBeUndefined();
  });
});
