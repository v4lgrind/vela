import { describe, expect, it } from 'vitest';

import { needsDesktopTranscode } from './desktopCodec';

describe('needsDesktopTranscode', () => {
  it('keeps H.264 and AAC in MP4', () => {
    expect(needsDesktopTranscode({
      Container: 'mp4',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'aac', Type: 'Audio' },
      ],
      Type: 'Movie',
    })).toBe(false);
  });

  it('keeps H.264 and AAC when the item Container is a raw ffprobe CSV', () => {
    expect(needsDesktopTranscode({
      Container: 'mov,mp4,m4a,3gp,3g2,mj2',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'aac', Type: 'Audio' },
      ],
      Type: 'Episode',
    })).toBe(false);
  });

  it('prefers the normalized MediaSources container over the item Container', () => {
    expect(needsDesktopTranscode({
      Container: 'mov,mp4,m4a,3gp,3g2,mj2',
      MediaSources: [{
        Container: 'mp4',
        MediaStreams: [
          { Codec: 'h264', Type: 'Video' },
          { Codec: 'aac', Type: 'Audio' },
        ],
      }],
      Type: 'Episode',
    })).toBe(false);
  });

  it('transcodes MKV containers for Chromium offline playback', () => {
    expect(needsDesktopTranscode({
      Container: 'mkv',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'aac', Type: 'Audio' },
      ],
      Type: 'Episode',
    })).toBe(true);
  });

  it('transcodes unsupported MP4 audio codecs', () => {
    expect(needsDesktopTranscode({
      Container: 'mp4',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'dts', Type: 'Audio' },
      ],
      Type: 'Movie',
    })).toBe(true);
  });

  it('keeps VP9 and Opus in WebM', () => {
    expect(needsDesktopTranscode({
      Container: 'webm',
      MediaStreams: [
        { Codec: 'vp9', Type: 'Video' },
        { Codec: 'opus', Type: 'Audio' },
      ],
      Type: 'Movie',
    })).toBe(false);
  });

  it('keeps common audio containers and transcodes unknown ones', () => {
    expect(needsDesktopTranscode({ Container: 'flac', Type: 'Audio' })).toBe(false);
    expect(needsDesktopTranscode({ Container: 'wma', Type: 'Audio' })).toBe(true);
  });
});
