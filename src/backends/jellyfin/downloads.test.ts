import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DownloadRequest, MediaItem, ServerConnection } from '@/domain';

import { JellyfinClient } from './client';
import { planDownload, withForcedVideoParams } from './downloads';
import { pushOfflineProgress } from './userData';

const connection: ServerConnection = {
  kind: 'jellyfin', serverId: 's', serverName: 'S', user: { id: 'u1', name: 'u' }, baseUrl: 'https://jf',
  candidateUrls: [], tokenKey: 'k', deviceId: 'd',
};
const identity = { product: 'Vela', version: '1.0.0', deviceName: 'Android', platform: 'Android' };
const client = () => new JellyfinClient(connection, 'tok', identity);

const movie = {
  id: 'm1', kind: 'movie', title: 'Dune', genres: [], studios: [], images: {}, credits: [], durationMs: 3_600_000,
  user: { played: false, playCount: 0, favorite: false },
  versions: [{ id: 'm1', container: 'matroska,webm', video: [], audio: [],
    subtitles: [{ id: '4', language: 'fre', title: 'Français', isDefault: false, isForced: false, isHearingImpaired: false, isExternal: false, format: 'text' }] }],
} as MediaItem;

type Call = { method: string; path: string; params: URLSearchParams; body?: Record<string, unknown> };

function stub(answers: Record<string, unknown>, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    calls.push({ method: init?.method ?? 'GET', path: parsed.pathname, params: parsed.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = answers[parsed.pathname] ?? { Items: [] };
    return new Response(JSON.stringify(answer), { status });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('withForcedVideoParams', () => {
  it('adds video bitrate and resolution box params', () => {
    const params = new URL(withForcedVideoParams('https://jf/Videos/abc/stream.ts', 8_000_000, 720)).searchParams;
    expect([params.get('videoBitRate'), params.get('maxHeight'), params.get('maxWidth')]).toEqual(['8000000', '720', '1280']);
  });

  it('replaces an existing bitrate baked in by Jellyfin (case-insensitive)', () => {
    const params = new URL(withForcedVideoParams('https://jf/Videos/abc/stream.ts?VideoBitrate=25000000&MaxHeight=2160', 8_000_000, 720)).searchParams;
    expect(params.get('VideoBitrate')).toBeNull();
    expect(params.get('MaxHeight')).toBeNull();
    expect(params.get('videoBitRate')).toBe('8000000');
  });

  it('omits resolution params when height is 0 (bitrate-only cap)', () => {
    const params = new URL(withForcedVideoParams('https://jf/Videos/abc/stream.ts', 3_000_000, 0)).searchParams;
    expect(params.has('maxHeight')).toBe(false);
  });
});

describe('planDownload', () => {
  const request = (over: Partial<DownloadRequest> = {}): DownloadRequest => ({ itemId: 'm1', target: 'native', ...over });

  it('downloads the original file with its normalized container and markers', async () => {
    stub({ '/MediaSegments/m1': { Items: [{ Type: 'Intro', StartTicks: 0, EndTicks: 300_000_000 }] } });
    const plan = await planDownload(client(), request(), movie);
    expect(plan).toMatchObject({ url: 'https://jf/Items/m1/Download', fileExtension: 'mkv', isTranscoded: false, sidecars: [] });
    expect(plan.headers.Authorization).toContain('Token="tok"');
    expect(plan.markers).toEqual([{ kind: 'intro', startMs: 0, endMs: 30_000 }]);
  });

  it('asks for a capped transcode, forces the preset on the URL and estimates the size', async () => {
    const calls = stub({ '/Items/m1/PlaybackInfo': { MediaSources: [{ TranscodingUrl: '/videos/m1/stream.ts?api_key=x&VideoCodec=h264', Bitrate: 25_000_000 }] } });
    const plan = await planDownload(client(), request({
      transcode: { maxBitrate: 8_000_000, video: { bitrate: 8_000_000, maxSize: { width: 1280, height: 720 } }, audioStreamId: '2' },
      subtitleStreamId: '4',
    }), movie);
    const body = calls.find((c) => c.path === '/Items/m1/PlaybackInfo')!.body!;
    expect(body).toMatchObject({ MaxStreamingBitrate: 8_000_000, AudioStreamIndex: 2, AllowVideoStreamCopy: false, AllowAudioStreamCopy: true });
    const url = new URL(plan.url);
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(url.searchParams.get('videoBitRate')).toBe('8000000');
    expect(plan).toMatchObject({ fileExtension: 'ts', isTranscoded: true, estimatedSizeBytes: 3_600_000_000 });
    expect(plan.sidecars).toEqual([{ kind: 'subtitle', url: 'https://jf/Videos/m1/m1/Subtitles/4/Stream.srt', format: 'srt', language: 'fre', label: 'Français' }]);
  });

  it('falls back to the original when the server offers no transcode', async () => {
    stub({ '/Items/m1/PlaybackInfo': { MediaSources: [{}] } });
    const plan = await planDownload(client(), request({ transcode: {}, target: 'desktop' }), movie);
    expect(plan).toMatchObject({ url: 'https://jf/Items/m1/Download', isTranscoded: false });
  });
});

describe('pushOfflineProgress', () => {
  const LOCAL = Date.parse('2026-01-02T10:00:00Z');
  const progress = { itemId: 'e1', positionMs: 120_500, played: false, lastPlayedAtMs: LOCAL };

  it('pushes newer local progress', async () => {
    const calls = stub({ '/UserItems/e1/UserData': { LastPlayedDate: '2026-01-01T10:00:00Z' } });
    expect(await pushOfflineProgress(client(), progress)).toBe('pushed');
    expect(calls.map((c) => `${c.method} ${c.path}?${c.params}`)).toEqual([
      'GET /UserItems/e1/UserData?userId=u1', 'POST /UserItems/e1/UserData?userId=u1',
    ]);
    expect(calls[1].body).toEqual({ PlaybackPositionTicks: 1_205_000_000, LastPlayedDate: '2026-01-02T10:00:00.000Z' });
  });

  it('keeps newer server progress', async () => {
    const calls = stub({ '/UserItems/e1/UserData': { LastPlayedDate: '2026-01-03T10:00:00Z' } });
    expect(await pushOfflineProgress(client(), progress)).toBe('kept');
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('marks played when completed, and never un-marks after a partial rewatch', async () => {
    let calls = stub({ '/UserItems/e1/UserData': {} });
    await pushOfflineProgress(client(), { ...progress, played: true });
    expect(calls[1].body).toMatchObject({ Played: true, PlaybackPositionTicks: 0 });
    calls = stub({ '/UserItems/e1/UserData': { Played: true, LastPlayedDate: '2026-01-01T10:00:00Z' } });
    await pushOfflineProgress(client(), progress);
    expect(calls[1].body).not.toHaveProperty('Played');
  });

  it('fails when the server refuses', async () => {
    stub({}, 500);
    await expect(pushOfflineProgress(client(), progress)).rejects.toThrow();
  });
});
