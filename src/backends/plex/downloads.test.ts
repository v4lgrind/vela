import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DownloadRequest, ServerConnection } from '@/domain';

import { PlexClient } from './client';
import { planPlexDownload } from './downloads';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));
const connection = {
  kind: 'plex', serverId: 'm', serverName: 'S', user: { id: 'u', name: 'U' }, baseUrl: 'https://pms.test', candidateUrls: [], tokenKey: 'k', deviceId: 'client-1',
} as ServerConnection;
const identity = { product: 'Vela', version: '1', deviceName: 'Phone', platform: 'Android' };

const movie = fixture('movie-detail');
const item = movie.MediaContainer.Metadata[0];
const part = item.Media[0].Part[0];
let decisionCode: number;
let requests: URL[];

beforeEach(() => {
  requests = [];
  decisionCode = 1001;
  const withSidecar = structuredClone(movie);
  withSidecar.MediaContainer.Metadata[0].Media[0].Part[0].Stream.push({ id: 9, streamType: 3, codec: 'srt', key: '/library/streams/9', languageCode: 'fra', displayTitle: 'Français' });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.endsWith('/decision')) return new Response(JSON.stringify({ MediaContainer: { generalDecisionCode: decisionCode } }));
    return new Response(JSON.stringify(withSidecar));
  }));
});
afterEach(() => vi.unstubAllGlobals());

const plan = (over: Partial<DownloadRequest> = {}) =>
  planPlexDownload(new PlexClient(connection, 'tok', identity), { itemId: item.ratingKey, target: 'native', ...over });

describe('Plex downloads', () => {
  it('plans the original file with the token header', async () => {
    const result = await plan();
    expect(result).toMatchObject({
      url: `https://pms.test${part.key}?download=1`, fileExtension: item.Media[0].container, isTranscoded: false, estimatedSizeBytes: part.size,
    });
    expect(result.headers['X-Plex-Token']).toBe('tok');
  });

  it('adds the chosen srt as a sidecar', async () => {
    expect((await plan({ subtitleStreamId: '9' })).sidecars).toEqual([
      { kind: 'subtitle', url: 'https://pms.test/library/streams/9?X-Plex-Token=tok', format: 'srt', language: 'fra', label: 'Français' },
    ]);
    expect((await plan()).sidecars).toEqual([]);
  });

  it('copies intro/credits markers', async () => {
    expect((await plan()).markers.map((m) => m.kind)).toContain('credits');
  });

  it('transcode request uses the mkv http stream', async () => {
    const result = await plan({ transcode: { video: { bitrate: 4_000_000, maxSize: { width: 1280, height: 720 } }, audioStreamId: '382253' } });
    const url = new URL(result.url);
    expect(url.pathname).toBe('/video/:/transcode/universal/start.mkv');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      path: `/library/metadata/${item.ratingKey}`, protocol: 'http', directPlay: '0', directStream: '0',
      maxVideoBitrate: '4000', videoResolution: '1280x720', audioStreamID: '382253',
    });
    expect(url.searchParams.get('X-Plex-Client-Profile-Extra')).toContain('context=streaming&protocol=http&container=mkv&videoCodec=h264');
    expect(result).toMatchObject({ fileExtension: 'mkv', isTranscoded: true });
    expect(result.estimatedSizeBytes).toBeGreaterThan(0);
  });

  it('falls back to the original when the server refuses the conversion', async () => {
    decisionCode = 2000;
    const result = await plan({ transcode: { maxBitrate: 2_000_000 } });
    expect(result).toMatchObject({ url: `https://pms.test${part.key}?download=1`, isTranscoded: false });
  });
});
