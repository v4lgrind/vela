import { describe, expect, it, vi } from 'vitest';

import type { MediaBackend, MediaItem, PlaybackPlan } from '@/domain';

import { castRequestFor } from './castRequest';

const item = {
  id: 'm1', kind: 'movie', title: 'Film', genres: [], studios: [], versions: [], credits: [],
  images: { poster: '/poster' }, user: { played: false, playCount: 0, favorite: false, resumePositionMs: 600_000 },
} as unknown as MediaItem;

const plan = (over: Partial<PlaybackPlan>) => ({
  method: 'transcode', url: 'https://pms/start.m3u8?a=1', headers: {}, mediaElementUrl: 'https://pms/start.m3u8?a=1&X-Plex-Token=t',
  startOffsetMs: 600_000, externalSubtitles: [], sessionId: 's', transcodeReasons: [], version: { id: 'v', video: [], audio: [], subtitles: [] }, ...over,
}) as PlaybackPlan;

const backend = (castMode: MediaBackend['castMode'], negotiated = plan({})) => ({
  castMode,
  imageUrl: (ref: string) => `https://pms/photo?url=${ref}`,
  playback: { negotiate: vi.fn(async () => negotiated) },
}) as unknown as MediaBackend;

describe('castRequestFor', () => {
  it("casts the web plan's media element URL", async () => {
    const b = backend('media-url');
    expect(await castRequestFor(b, item, { serverUrl: 'https://pms', token: 't' })).toEqual({
      kind: 'url', url: 'https://pms/start.m3u8?a=1&X-Plex-Token=t', contentType: 'application/x-mpegURL',
      title: 'Film', imageUrl: 'https://pms/photo?url=/poster', startPositionMs: 0,
    });
    expect(b.playback.negotiate).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'm1', target: 'web', startMs: 600_000 }));
  });

  it('casts a direct file from its resume point', async () => {
    const b = backend('media-url', plan({ method: 'direct-play', url: 'https://pms/file.mp4', mediaElementUrl: 'https://pms/file.mp4?X-Plex-Token=t', startOffsetMs: 0 }));
    expect(await castRequestFor(b, item, { serverUrl: 'https://pms', token: 't' })).toMatchObject({ contentType: 'video/mp4', startPositionMs: 600_000 });
  });

  it('keeps the Jellyfin receiver for Jellyfin', async () => {
    expect(await castRequestFor(backend('jellyfin-receiver'), item, { serverUrl: 'https://jf', token: 'tok' })).toEqual({
      kind: 'receiver', itemId: 'm1', serverUrl: 'https://jf', accessToken: 'tok', startPositionTicks: 6_000_000_000, title: 'Film',
    });
  });
});
