import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { usePreferencesStore } from '@/store/preferences-store';

import { usePlayerSession } from './usePlayerSession';

/**
 * Characterization of the Jellyfin PlaybackInfo negotiation as it existed
 * before the playback port (Phase 4). Each scenario's request (query + body)
 * and the stream URL derived from the answer are pinned in golden files under
 * `src/backends/jellyfin/__fixtures__/playback-info/`; the Jellyfin backend
 * must reproduce them exactly.
 */

const GOLDEN = '../../backends/jellyfin/__fixtures__/playback-info';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'item1' }, query: {} }) }));
vi.mock('@/store/jellyfin-store', () => ({
  useJellyfinStore: () => ({ accessToken: 'tok', serverUrl: 'https://jf.example', userId: 'u1', getImageUrl: () => '' }),
}));
vi.mock('@/utils/codecDetection', async (importActual) => ({
  ...(await importActual<typeof import('@/utils/codecDetection')>()),
  getDeviceCapabilities: async () => ({
    hardwareVideoCodecs: ['h264', 'hevc'],
    softwareVideoCodecs: [],
    platformAudioCodecs: ['aac', 'ac3', 'eac3', 'mp3', 'opus', 'flac'],
    ffmpegAudioCodecs: ['dts', 'truehd'],
    ffmpegVideoCodecs: [],
    displayWidth: 1920,
    displayHeight: 1080,
    manufacturer: 'Test',
    model: 'Phone',
    androidApi: 34,
  }),
}));

/** A 4K HEVC source the server decided to transcode. */
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

let calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
  calls = [];
  localStorage.setItem('msplayer-device-id', 'browser-test');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(structuredClone(SERVER_ANSWER)), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

type Args = Parameters<ReturnType<typeof usePlayerSession>['fetchPlaybackInfo']>;

async function negotiate(args: Args, bitrate = 0, isNative = true) {
  usePreferencesStore().preferredBitrate = bitrate;
  const session = usePlayerSession(ref(null), isNative);
  session.selectedBitrate.value = bitrate;
  const result = await session.fetchPlaybackInfo(...args);
  session.playSessionId.value = result.PlaySessionId;
  session.determinePlaybackMethod(result.MediaSources[0]);
  const [call] = calls;
  const url = new URL(call.url);
  return {
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: call.body,
    transcodingUrl: result.MediaSources[0].TranscodingUrl,
    playMethod: session.playMethod.value,
    streamUrl: session.hlsUrl.value,
  };
}

const SCENARIOS: Record<string, { args: Args; bitrate?: number; isNative?: boolean }> = {
  'web-default': { args: [undefined, undefined, false, false], isNative: false },
  'native-default': { args: [undefined, undefined, false, true] },
  'native-resume': { args: [12_000_000_000, 1, false, true] },
  'native-quality-cap': { args: [undefined, 1, false, true], bitrate: 8_000_000 },
  'native-quality-cap-resume': { args: [12_000_000_000, 1, false, true], bitrate: 8_000_000 },
  'native-force-transcode': { args: [undefined, 1, true, true] },
  'native-force-transcode-resume': { args: [12_000_000_000, 1, true, true] },
  'native-transcode-audio': { args: [12_000_000_000, 1, false, true, true] },
  'native-strip-hevc': { args: [12_000_000_000, 1, true, true, false, true] },
  'native-burn-in-subtitle': { args: [12_000_000_000, 1, false, true, false, false, 3] },
};

describe('PlaybackInfo negotiation (characterization)', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const result = await negotiate(scenario.args, scenario.bitrate, scenario.isNative);
      await expect(JSON.stringify(result, null, 2) + '\n').toMatchFileSnapshot(`${GOLDEN}/${name}.json`);
    });
  }
});
