import { describe, it, expect } from 'vitest';
import {
  buildPlaybackUrl,
  withMaxVideoSize,
  withPlaybackApiKey,
  withoutPlaybackApiKey,
  type PlaybackUrlContext,
} from './urls';

const baseCtx: PlaybackUrlContext = {
  serverUrl: 'http://192.168.1.10:8096',
  itemId: 'item-1',
  accessToken: 'tok123',
  isNative: false,
  playSessionId: 'sess-9',
};

describe('buildPlaybackUrl — DirectPlay auth', () => {
  it('appends ApiKey on web, where <video>.src cannot send auth headers', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectPlay: true, Id: 'ms-7' },
      { ...baseCtx, isNative: false },
    );
    expect(method).toBe('DirectPlay');
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item-1/stream?static=true&mediaSourceId=ms-7&ApiKey=tok123',
    );
    expect(new URL(url).searchParams.get('api_key')).toBeNull();
  });

  it('omits ApiKey on native, where the token rides in the auth header', () => {
    const { method, url } = buildPlaybackUrl(
      { SupportsDirectPlay: true, Id: 'ms-7' },
      { ...baseCtx, isNative: true },
    );
    expect(method).toBe('DirectPlay');
    expect(new URL(url).searchParams.has('ApiKey')).toBe(false);
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item-1/stream?static=true&mediaSourceId=ms-7',
    );
  });

  it('falls back to itemId when the media source has no Id', () => {
    const { url } = buildPlaybackUrl({ SupportsDirectPlay: true }, baseCtx);
    expect(url).toContain('mediaSourceId=item-1');
  });

  it('encodes web DirectPlay IDs and token without changing the query layout', () => {
    const { url } = buildPlaybackUrl(
      { SupportsDirectPlay: true, Id: 'source +&/7' },
      { ...baseCtx, itemId: 'item +&/1', accessToken: 'tok +&/=?' },
    );
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item%20%2B%26%2F1/stream?static=true&mediaSourceId=source%20%2B%26%2F7&ApiKey=tok%20%2B%26%2F%3D%3F',
    );
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

  it('removes a server-supplied legacy token when HLS uses an Authorization header', () => {
    const { url } = buildPlaybackUrl(
      { TranscodingUrl: '/videos/x/master.m3u8?api_key=old-token&StartTimeTicks=123' },
      baseCtx,
    );
    expect(url).toBe('http://192.168.1.10:8096/videos/x/master.m3u8?StartTimeTicks=123');
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

  it('encodes fallback HLS IDs and session ID', () => {
    const { url } = buildPlaybackUrl(
      { Id: 'source +&/7' },
      { ...baseCtx, itemId: 'item +&/1', playSessionId: 'session +&/9' },
    );
    expect(url).toBe(
      'http://192.168.1.10:8096/Videos/item%20%2B%26%2F1/master.m3u8?mediaSourceId=source%20%2B%26%2F7&PlaySessionId=session%20%2B%26%2F9',
    );
  });
});

describe('withMaxVideoSize', () => {
  it('adds size limits to a relative server TranscodingUrl', () => {
    expect(withMaxVideoSize('/videos/x/master.m3u8?StartTimeTicks=123', 2424, 1080))
      .toBe('/videos/x/master.m3u8?StartTimeTicks=123&maxWidth=2424&maxHeight=1080');
  });

  it('replaces server size limits case-insensitively on absolute URLs', () => {
    const url = withMaxVideoSize(
      'https://jf.example/videos/x/master.m3u8?MaxWidth=3840&MaxHeight=2160',
      1920,
      1080,
    );
    const params = new URL(url).searchParams;
    expect(params.get('MaxWidth')).toBeNull();
    expect(params.get('MaxHeight')).toBeNull();
    expect(params.get('maxWidth')).toBe('1920');
    expect(params.get('maxHeight')).toBe('1080');
  });
});

describe('native Safari HLS URL auth', () => {
  it('adds encoded ApiKey without rewriting unrelated server parameters', () => {
    expect(withPlaybackApiKey(
      'http://jf.example/Videos/x/master.m3u8?StartTimeTicks=123&AudioStreamIndex=1',
      'token +/&',
    )).toBe('http://jf.example/Videos/x/master.m3u8?StartTimeTicks=123&AudioStreamIndex=1&ApiKey=token%20%2B%2F%26');
  });

  it('replaces a server-supplied legacy token instead of duplicating it', () => {
    const url = 'http://jf.example/Videos/x/master.m3u8?StartTimeTicks=123&api_key=old&AudioStreamIndex=1';
    expect(withPlaybackApiKey(url, 'new token')).toBe(
      'http://jf.example/Videos/x/master.m3u8?StartTimeTicks=123&AudioStreamIndex=1&ApiKey=new%20token',
    );
    expect(withoutPlaybackApiKey(url)).toBe(
      'http://jf.example/Videos/x/master.m3u8?StartTimeTicks=123&AudioStreamIndex=1',
    );
  });

  it('preserves unmodified server query bytes and replaces an existing ApiKey', () => {
    const url = 'https://jf.example/Videos/x/master.m3u8?name=a%20b&other=1&&next=2';
    expect(withoutPlaybackApiKey(url)).toBe(url);
    expect(withPlaybackApiKey(`${url}&ApiKey=old`, 'new key')).toBe(
      `${url}&ApiKey=new%20key`,
    );
  });
});
