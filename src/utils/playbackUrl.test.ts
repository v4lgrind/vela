import { describe, it, expect } from 'vitest';
import { buildPlaybackUrl, type PlaybackUrlContext } from './playbackUrl';

const baseCtx: PlaybackUrlContext = {
  serverUrl: 'http://192.168.1.10:8096',
  itemId: 'item-1',
  accessToken: 'tok123',
  isNative: false,
  playSessionId: 'sess-9',
};

describe('buildPlaybackUrl — DirectPlay auth (regression for web 401 fix)', () => {
  it('appends api_key on web, where <video>.src cannot send auth headers', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectPlay: true, Id: 'ms-7' },
      { ...baseCtx, isNative: false },
    );
    expect(method).toBe('DirectPlay');
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item-1/stream?static=true&mediaSourceId=ms-7&api_key=tok123',
    );
    expect(url).toContain('api_key=tok123');
  });

  it('omits api_key on native, where the token rides in the auth header', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectPlay: true, Id: 'ms-7' },
      { ...baseCtx, isNative: true },
    );
    expect(method).toBe('DirectPlay');
    expect(url).not.toContain('api_key');
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item-1/stream?static=true&mediaSourceId=ms-7',
    );
  });

  it('falls back to itemId when the media source has no Id', () => {
    const { url } = buildPlaybackUrl({ SupportsDirectPlay: true }, baseCtx);
    expect(url).toContain('mediaSourceId=item-1');
  });
});

describe('buildPlaybackUrl — transcode/direct-stream', () => {
  it('uses the server TranscodingUrl and normalizes "?&" to "?"', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectStream: true, TranscodingUrl: '/videos/x/master.m3u8?&foo=1' },
      baseCtx,
    );
    expect(method).toBe('DirectStream');
    expect(url).toBe('http://192.168.1.10:8096/videos/x/master.m3u8?foo=1');
  });

  it('marks Transcode when neither DirectPlay nor DirectStream is supported', () => {
    const { method } = buildPlaybackUrl(
      { TranscodingUrl: '/videos/x/master.m3u8' },
      baseCtx,
    );
    expect(method).toBe('Transcode');
  });

  it('builds a master.m3u8 fallback with PlaySessionId when no TranscodingUrl is given', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectStream: false, Id: 'ms-3' },
      baseCtx,
    );
    expect(method).toBe('Transcode');
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item-1/master.m3u8?mediaSourceId=ms-3&PlaySessionId=sess-9',
    );
  });
});
