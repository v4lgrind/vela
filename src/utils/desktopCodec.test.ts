import { describe, expect, it } from 'vitest';

import { getPrimaryContainer, needsDesktopTranscode } from './desktopCodec';

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

  it('keeps H.264 and AAC in MKV — Chromium demuxes Matroska natively', () => {
    expect(needsDesktopTranscode({
      Container: 'mkv',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'aac', Type: 'Audio' },
      ],
      Type: 'Episode',
    })).toBe(false);
  });

  it('matches the raw ffprobe "matroska,webm" container against the MKV profile, not WebM', () => {
    expect(needsDesktopTranscode({
      Container: 'matroska,webm',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'flac', Type: 'Audio' },
      ],
      Type: 'Movie',
    })).toBe(false);
  });

  it('transcodes HEVC in MKV — Chromium decode is not guaranteed', () => {
    expect(needsDesktopTranscode({
      Container: 'mkv',
      MediaStreams: [
        { Codec: 'hevc', Type: 'Video' },
        { Codec: 'aac', Type: 'Audio' },
      ],
      Type: 'Movie',
    })).toBe(true);
  });

  it('transcodes MKV with audio codecs Chromium cannot decode', () => {
    expect(needsDesktopTranscode({
      Container: 'mkv',
      MediaStreams: [
        { Codec: 'h264', Type: 'Video' },
        { Codec: 'ac3', Type: 'Audio' },
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

describe('getPrimaryContainer', () => {
  it('prefers the normalized MediaSources container', () => {
    expect(getPrimaryContainer({
      Container: 'mov,mp4,m4a,3gp,3g2,mj2',
      MediaSources: [{ Container: 'mp4' }],
    })).toBe('mp4');
  });

  it('normalizes the raw ffprobe matroska token to mkv', () => {
    expect(getPrimaryContainer({ Container: 'matroska,webm' })).toBe('mkv');
  });

  it('is undefined without any container', () => {
    expect(getPrimaryContainer({})).toBeUndefined();
  });
});
