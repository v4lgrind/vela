import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceCapabilities, PlaybackRequest, ServerConnection } from '@/domain';

import { PlexClient } from './client';
import { clientProfileExtra, createPlexPlayback } from './playback';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));
const connection = {
  kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test', candidateUrls: [], tokenKey: 'k', deviceId: 'client-1',
} as ServerConnection;
const identity = { product: 'Vela', version: '1', deviceName: 'Phone', platform: 'Android' };

const device: DeviceCapabilities = {
  hardwareVideoCodecs: ['video/avc', 'video/hevc'], softwareVideoCodecs: [], ffmpegVideoCodecs: [],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3'], ffmpegAudioCodecs: ['audio/vnd.dts'],
  displayWidth: 1080, displayHeight: 2400, isKnown: true,
};

const movie = fixture('movie-detail');
const movieId = movie.MediaContainer.Metadata[0].ratingKey;
const part = movie.MediaContainer.Metadata[0].Media[0].Part[0];

let decision: Record<string, unknown>;
let requests: URL[];

beforeEach(() => {
  requests = [];
  decision = fixture('decision');
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.endsWith('/decision')) return new Response(JSON.stringify({ MediaContainer: decision }));
    if (url.pathname.startsWith('/library/metadata/')) return new Response(JSON.stringify(movie));
    return new Response('');
  }));
});
afterEach(() => vi.unstubAllGlobals());

const playback = () => createPlexPlayback(new PlexClient(connection, 'server-token', identity));
const request = (over: Partial<PlaybackRequest> = {}): PlaybackRequest => ({
  itemId: movieId, target: 'native', device, startMs: 61_500,
  constraints: { allowDirectPlay: true, allowAudioCopy: true, excludeVideoCodecs: [] }, ...over,
});
const decisionParams = () => Object.fromEntries(requests.find((u) => u.pathname.endsWith('/decision'))!.searchParams);

describe('Plex playback negotiation', () => {
  it('plays the file directly when the device decodes it, without asking the server', async () => {
    const plan = await playback().negotiate(request());
    expect(requests.some((u) => u.pathname.endsWith('/decision'))).toBe(false);
    expect(plan.method).toBe('direct-play');
    expect(plan.url).toBe(`https://pms.test${part.key}`);
    expect(plan.mediaElementUrl).toBe(`https://pms.test${part.key}?X-Plex-Token=server-token`);
    expect(plan.headers['X-Plex-Token']).toBe('server-token');
    expect(plan.startOffsetMs).toBe(0);
    expect(plan.sessionId).toBe('');
  });

  it('streams when the device lacks the video decoder', async () => {
    const plan = await playback().negotiate(request({ device: { ...device, hardwareVideoCodecs: ['video/avc'] } }));
    expect(plan.method).toBe('transcode');
    expect(decisionParams()).toMatchObject({ directPlay: '0', directStream: '1', offset: '61' });
    expect(decisionParams().videoResolution).toBeUndefined();
  });

  it('streams when the chosen audio track cannot be decoded', async () => {
    const plan = await playback().negotiate(request({ device: { ...device, platformAudioCodecs: ['audio/ac3'] } }));
    expect(plan.method).toBe('transcode');
  });

  it('streams HLS from the decision parameters when the server converts', async () => {
    const plan = await playback().negotiate(request({ constraints: { allowDirectPlay: false, allowAudioCopy: true, excludeVideoCodecs: [] } }));
    expect(plan.method).toBe('transcode');
    const url = new URL(plan.url);
    expect(url.pathname).toBe('/video/:/transcode/universal/start.m3u8');
    expect(Object.fromEntries(url.searchParams)).toEqual(decisionParams());
    expect(url.searchParams.get('X-Plex-Token')).toBeNull();
    expect(plan.startOffsetMs).toBe(61_000);
    expect(plan.sessionId).toBe(url.searchParams.get('session'));
    expect(plan.transcodeReasons).toEqual(['Direct play not available; Conversion OK.']);
    expect(decisionParams()).toMatchObject({ directStream: '0', videoResolution: '2400x1080' });
    expect(plan.version.id).toBe(String(movie.MediaContainer.Metadata[0].Media[0].id));
  });

  it('burns in a picture subtitle through a transcode', async () => {
    await playback().negotiate(request({ subtitle: { streamId: '382258', mode: 'burn-in' } }));
    expect(decisionParams()).toMatchObject({ directPlay: '0', directStream: '0', subtitles: 'burn', subtitleStreamID: '382258' });
    expect(Number(decisionParams().maxVideoBitrate)).toBeGreaterThan(0);
  });

  it('passes the chosen audio stream and quality cap', async () => {
    await playback().negotiate(request({ audioStreamId: '382253', maxBitrate: 4_000_000, maxSize: { width: 1280, height: 720 } }));
    expect(decisionParams()).toMatchObject({ directPlay: '0', audioStreamID: '382253', maxVideoBitrate: '4000', videoResolution: '1280x720' });
  });

  it('fails when the server refuses the item', async () => {
    decision = { ...decision, generalDecisionCode: 4005, generalDecisionText: 'no profile' };
    await expect(playback().negotiate(request({ preferStream: true }))).rejects.toThrow(/4005/);
  });

  it('does not direct play Dolby Vision profile 5 without a DV decoder', async () => {
    const dv = structuredClone(movie);
    const video = dv.MediaContainer.Metadata[0].Media[0].Part[0].Stream.find((s: { streamType: number }) => s.streamType === 1);
    Object.assign(video, { codec: 'hevc', DOVIPresent: true, DOVIProfile: 5 });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return new Response(JSON.stringify(url.pathname.endsWith('/decision') ? { MediaContainer: decision } : dv));
    });
    const plan = await playback().negotiate(request());
    expect(plan.method).toBe('transcode');
  });

  it('plays only H.264 + AAC MP4 directly on the web', async () => {
    const plan = await playback().negotiate(request({ target: 'web', device: undefined }));
    expect(plan.method).toBe('transcode');
  });

  it('lists the external subtitle files as sidecars only', async () => {
    const withSidecar = structuredClone(movie);
    withSidecar.MediaContainer.Metadata[0].Media[0].Part[0].Stream.push({ id: 9, streamType: 3, codec: 'srt', key: '/library/streams/9' });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify(url.pathname.endsWith('/decision') ? { MediaContainer: decision } : withSidecar));
    });
    const plan = await playback().negotiate(request());
    expect(plan.method).toBe('direct-play');
    expect(plan.externalSubtitles).toEqual([{ streamId: '9', url: 'https://pms.test/library/streams/9?X-Plex-Token=server-token', format: 'srt' }]);
  });
});

describe('client profile', () => {
  it('declares the device codecs for direct play and HLS targets', () => {
    const extra = clientProfileExtra(request());
    expect(extra).toContain('add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264,hevc&audioCodec=aac,ac3,eac3)');
    expect(extra).toContain('videoCodec=h264,hevc&audioCodec=aac,ac3,eac3,dca)');
  });

  it('applies the player fallbacks', () => {
    const extra = clientProfileExtra(request({ constraints: { allowDirectPlay: false, allowAudioCopy: false, excludeVideoCodecs: ['hevc'] } }));
    expect(extra).toContain('container=mpegts&videoCodec=h264&audioCodec=aac)');
  });

  it('uses a browser profile on the web', () => {
    const extra = clientProfileExtra(request({ target: 'web', device: undefined }));
    expect(extra).toContain('add-direct-play-profile(type=videoProfile&container=mp4&videoCodec=h264&audioCodec=aac,mp3)');
  });
});

describe('Plex playback reporting', () => {
  const calls = () => requests.map((u) => `${u.pathname} ${u.searchParams.get('state') ?? u.searchParams.get('session') ?? ''}`);

  it('reports the timeline and stops the transcode once', async () => {
    const pb = playback();
    const plan = await pb.negotiate(request({ preferStream: true }));
    requests = [];
    const reporter = pb.reporter(plan, movieId);
    await reporter.start({ positionMs: 1000, durationMs: 5000, isPaused: false });
    await reporter.progress({ positionMs: 2000.6, isPaused: true });
    await reporter.stop({ positionMs: 3000, isPaused: false });
    await reporter.release();
    expect(calls()).toEqual([
      '/:/timeline playing', '/:/timeline paused', '/:/timeline stopped', `/video/:/transcode/universal/stop ${plan.sessionId}`,
    ]);
    expect(Object.fromEntries(requests[1].searchParams)).toMatchObject({ ratingKey: movieId, key: `/library/metadata/${movieId}`, time: '2001' });
  });

  it('has no transcode to stop after direct play', async () => {
    const pb = playback();
    const plan = await pb.negotiate(request());
    requests = [];
    await pb.reporter(plan, movieId).stop({ positionMs: 0, isPaused: false });
    expect(calls()).toEqual(['/:/timeline stopped']);
  });
});
