import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceCapabilities, PlaybackRequest, ServerConnection } from '@/domain';

import { JellyfinClient } from '../client';

import { negotiate } from './negotiate';

/** Same device and server answer as the characterization test that produced the golden files. */
const DEVICE: DeviceCapabilities = {
  hardwareVideoCodecs: ['h264', 'hevc'],
  softwareVideoCodecs: [],
  platformAudioCodecs: ['aac', 'ac3', 'eac3', 'mp3', 'opus', 'flac'],
  ffmpegAudioCodecs: ['dts', 'truehd'],
  ffmpegVideoCodecs: [],
  displayWidth: 1920,
  displayHeight: 1080,
  isKnown: true,
};
const SERVER_ANSWER = {
  PlaySessionId: 'ps1',
  MediaSources: [{
    Id: 'item1',
    SupportsDirectPlay: false,
    SupportsDirectStream: false,
    TranscodingUrl: '/videos/item1/master.m3u8?MediaSourceId=item1&VideoCodec=h264&api_key=legacy',
    MediaStreams: [
      { Index: 0, Type: 'Video', Codec: 'hevc', Width: 3840, Height: 2160, VideoRangeType: 'HDR10' },
      { Index: 1, Type: 'Audio', Codec: 'eac3', Channels: 6, Language: 'fre', IsDefault: true },
    ],
  }],
};
const connection: ServerConnection = {
  kind: 'jellyfin', serverId: 's', serverName: 'S', user: { id: 'u1', name: 'u' }, baseUrl: 'https://jf.example',
  candidateUrls: [], tokenKey: 'k', deviceId: 'd',
};
const identity = { product: 'Vela', version: '1.0.0', deviceName: 'Android', platform: 'Android' };

const RESUME_MS = 1_200_000;
const OPEN = { allowDirectPlay: true, allowAudioCopy: true, excludeVideoCodecs: [] as string[] };
const native = (extra: Partial<PlaybackRequest> = {}): PlaybackRequest =>
  ({ itemId: 'item1', target: 'native', device: DEVICE, constraints: OPEN, ...extra });

const SCENARIOS: Record<string, PlaybackRequest> = {
  'web-default': { itemId: 'item1', target: 'web', constraints: OPEN },
  'native-default': native(),
  'native-resume': native({ startMs: RESUME_MS, audioStreamId: '1' }),
  'native-quality-cap': native({ audioStreamId: '1', maxBitrate: 8_000_000 }),
  'native-quality-cap-resume': native({ startMs: RESUME_MS, audioStreamId: '1', maxBitrate: 8_000_000 }),
  'native-force-transcode': native({ audioStreamId: '1', constraints: { ...OPEN, allowDirectPlay: false } }),
  'native-force-transcode-resume': native({ startMs: RESUME_MS, audioStreamId: '1', constraints: { ...OPEN, allowDirectPlay: false } }),
  'native-transcode-audio': native({ startMs: RESUME_MS, audioStreamId: '1', constraints: { ...OPEN, allowAudioCopy: false } }),
  'native-strip-hevc': native({
    startMs: RESUME_MS, audioStreamId: '1', constraints: { ...OPEN, allowDirectPlay: false, excludeVideoCodecs: ['hevc'] },
  }),
  'native-burn-in-subtitle': native({ startMs: RESUME_MS, audioStreamId: '1', subtitle: { streamId: '3', mode: 'burn-in' } }),
};

const METHOD: Record<string, string> = { DirectPlay: 'direct-play', DirectStream: 'direct-stream', Transcode: 'transcode' };

let calls: { url: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(structuredClone(SERVER_ANSWER)), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('Jellyfin negotiate reproduces the pinned PlaybackInfo requests', () => {
  for (const [name, request] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const golden = JSON.parse(readFileSync(resolve(__dirname, `../__fixtures__/playback-info/${name}.json`), 'utf8'));
      const plan = await negotiate(new JellyfinClient(connection, 'tok', identity), request);
      const url = new URL(calls[0].url);
      expect(url.pathname).toBe(golden.path);
      expect(Object.fromEntries(url.searchParams)).toEqual(golden.query);
      expect(calls[0].body).toEqual(golden.body);
      expect(plan.url).toBe(golden.streamUrl);
      expect(plan.method).toBe(METHOD[golden.playMethod]);
      expect(plan.sessionId).toBe('ps1');
      expect(plan.version.video[0]).toMatchObject({ codec: 'hevc', range: 'hdr10' });
    });
  }

  it('reports the HLS start offset only when the stream starts at the resume point', async () => {
    const client = new JellyfinClient(connection, 'tok', identity);
    expect((await negotiate(client, SCENARIOS['native-resume'])).startOffsetMs).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...SERVER_ANSWER,
      MediaSources: [{ ...SERVER_ANSWER.MediaSources[0], TranscodingUrl: '/videos/item1/master.m3u8?StartTimeTicks=12000000000&TranscodeReasons=VideoCodecNotSupported,AudioCodecNotSupported' }],
    }))));
    const plan = await negotiate(client, SCENARIOS['native-resume']);
    expect(plan.startOffsetMs).toBe(RESUME_MS);
    expect(plan.transcodeReasons).toEqual(['VideoCodecNotSupported', 'AudioCodecNotSupported']);
  });

  it('lists text subtitles as sidecars and pins web burn-in in the URL', async () => {
    const answer = structuredClone(SERVER_ANSWER);
    answer.MediaSources[0].MediaStreams.push(
      { Index: 2, Type: 'Subtitle', Codec: 'subrip', IsTextSubtitleStream: true, SupportsExternalStream: true } as never,
      { Index: 3, Type: 'Subtitle', Codec: 'pgssub', IsTextSubtitleStream: false } as never,
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer))));
    const client = new JellyfinClient(connection, 'tok', identity);
    const plan = await negotiate(client, { ...SCENARIOS['web-default'], subtitle: { streamId: '3', mode: 'burn-in' } });
    expect(plan.externalSubtitles).toEqual([
      { streamId: '2', url: 'https://jf.example/Videos/item1/item1/Subtitles/2/0/Stream.vtt', format: 'vtt' },
    ]);
    expect(plan.url).toContain('SubtitleStreamIndex=3');
    expect(plan.url).toContain('SubtitleMethod=Encode');
    expect(plan.method).toBe('transcode');
  });

  it('builds a server stream with the chosen audio track when asked to (audio switch)', async () => {
    const client = new JellyfinClient(connection, 'tok', identity);
    const plan = await negotiate(client, { ...SCENARIOS['web-default'], audioStreamId: '2', preferStream: true });
    expect(plan.url).toBe('https://jf.example/videos/item1/master.m3u8?MediaSourceId=item1&VideoCodec=h264&AudioStreamIndex=2');
    expect(plan.method).toBe('transcode');

    const direct = { ...SERVER_ANSWER, MediaSources: [{ ...SERVER_ANSWER.MediaSources[0], SupportsDirectPlay: true, TranscodingUrl: undefined }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(direct))));
    const manual = await negotiate(client, { ...SCENARIOS['web-default'], audioStreamId: '2', preferStream: true });
    expect(manual.url).toBe('https://jf.example/Videos/item1/master.m3u8?mediaSourceId=item1&AudioStreamIndex=2&PlaySessionId=ps1');
  });
});
