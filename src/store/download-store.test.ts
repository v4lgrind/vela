import { describe, it, expect } from 'vitest';

import { withForcedVideoParams } from './download-store';

describe('withForcedVideoParams', () => {
  it('adds video bitrate and resolution box params', () => {
    const out = withForcedVideoParams('https://jf.example/Videos/abc/stream.ts', 8_000_000, 720);
    const params = new URL(out).searchParams;
    expect(params.get('videoBitRate')).toBe('8000000');
    expect(params.get('maxHeight')).toBe('720');
    expect(params.get('maxWidth')).toBe('1280');
  });

  it('replaces an existing bitrate baked in by Jellyfin (case-insensitive)', () => {
    const out = withForcedVideoParams(
      'https://jf.example/Videos/abc/stream.ts?VideoBitrate=25000000&MaxHeight=2160',
      8_000_000,
      720,
    );
    const params = new URL(out).searchParams;
    // No leftover duplicate under the original casing.
    expect(params.get('VideoBitrate')).toBeNull();
    expect(params.get('MaxHeight')).toBeNull();
    expect(params.get('videoBitRate')).toBe('8000000');
    expect(params.get('maxHeight')).toBe('720');
  });

  it('omits resolution params when height is 0 (bitrate-only cap)', () => {
    const out = withForcedVideoParams('https://jf.example/Videos/abc/stream.ts', 3_000_000, 0);
    const params = new URL(out).searchParams;
    expect(params.get('videoBitRate')).toBe('3000000');
    expect(params.has('maxHeight')).toBe(false);
    expect(params.has('maxWidth')).toBe(false);
  });

  it('returns the original string when the URL cannot be parsed', () => {
    expect(withForcedVideoParams('not a url', 8_000_000, 720)).toBe('not a url');
  });
});
