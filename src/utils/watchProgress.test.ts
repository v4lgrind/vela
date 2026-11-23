import { describe, it, expect } from 'vitest';

import type { MediaItem } from '@/domain';
import type { DownloadedMedia, WatchProgress } from '@/services/offlineDatabase';

import { effectiveProgress, offlineResumeSeconds, resumeCandidates } from './watchProgress';

const JAN_1 = Date.parse('2026-01-01T10:00:00Z');
const JAN_2 = Date.parse('2026-01-02T10:00:00Z');
const DURATION_MS = 3000 * 1000;

const local = (over: Partial<WatchProgress> = {}): WatchProgress => ({
  itemId: 'e1', position: 1200, duration: 3000, percentage: 40, completed: false, lastWatched: JAN_2, synced: false, ...over,
});

/** A server item resumed at `seconds` (of 3000 s), last played at `lastPlayedAt`. */
const serverItem = (seconds: number, lastPlayedAt?: string, played = false, kind: MediaItem['kind'] = 'episode'): MediaItem => ({
  id: 'e1', kind, title: 'e1', genres: [], studios: [], images: {}, durationMs: DURATION_MS,
  user: { played, playCount: played ? 1 : 0, favorite: false, resumePositionMs: seconds ? seconds * 1000 : undefined, lastPlayedAt },
} as MediaItem);

describe('effectiveProgress', () => {
  it('uses the server data when it is newer', () => {
    expect(effectiveProgress(serverItem(600, '2026-01-03T10:00:00Z'), local()))
      .toEqual({ position: 600, percentage: 20, played: false, lastPlayed: Date.parse('2026-01-03T10:00:00Z') });
  });

  it('uses local progress when it is newer, and on equal dates', () => {
    expect(effectiveProgress(serverItem(600, '2026-01-01T10:00:00Z'), local()))
      .toEqual({ position: 1200, percentage: 40, played: false, lastPlayed: JAN_2 });
    expect(effectiveProgress(serverItem(600, '2026-01-02T10:00:00Z'), local()).position).toBe(1200);
  });

  it('reads the server data alone when nothing was played offline', () => {
    expect(effectiveProgress(serverItem(300))).toEqual({ position: 300, percentage: 10, played: false, lastPlayed: 0 });
  });
});

describe('resumeCandidates', () => {
  const dl = (id: string, item: MediaItem): DownloadedMedia => ({
    itemId: id, type: 'Movie', name: id, filePath: id, fileSize: 1, downloadDate: 0, serverId: 's', markers: [], item: { ...item, id },
  });

  it('resume lists started videos under 90 %, newest first', () => {
    const downloads = [
      dl('older', serverItem(100, '2026-01-01T10:00:00Z', false, 'movie')),
      dl('newer', serverItem(0)),
      dl('almostDone', serverItem(2900, '2026-01-05T10:00:00Z', false, 'movie')),
      dl('unstarted', serverItem(0, undefined, false, 'movie')),
      dl('song', serverItem(50, '2026-01-06T10:00:00Z', false, 'track')),
    ];
    const progress = new Map([['newer', local({ itemId: 'newer' })]]);
    expect(resumeCandidates(downloads, progress).map((c) => c.media.itemId)).toEqual(['newer', 'older']);
  });

  it('skips videos marked played', () => {
    expect(resumeCandidates([dl('seen', serverItem(100, undefined, true, 'movie'))], new Map())).toEqual([]);
  });
});

describe('offlineResumeSeconds', () => {
  it('resumes at the newer server position over an older local one', () => {
    expect(offlineResumeSeconds(serverItem(2400, '2026-01-05T10:00:00Z'), local({ position: 300, lastWatched: JAN_1 }))).toBe(2400);
  });

  it('resumes at the newer local position', () => {
    expect(offlineResumeSeconds(serverItem(600, '2026-01-01T10:00:00Z'), local())).toBe(1200);
  });

  it('starts over a video finished on another device', () => {
    expect(offlineResumeSeconds(serverItem(0, '2026-01-05T10:00:00Z', true), local({ lastWatched: JAN_1 }))).toBeUndefined();
  });
});
