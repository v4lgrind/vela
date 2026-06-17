import { describe, it, expect } from 'vitest';
import { CODEC_MIME_MAP, isCodecSupported, isDolbyVision } from './codecDetection';

describe('isDolbyVision', () => {
  it('detects DV via codec name (dvhe / dvh1)', () => {
    expect(isDolbyVision('dvhe', '')).toBe(true);
    expect(isDolbyVision('dvh1', '')).toBe(true);
  });

  it('detects DV via profile string', () => {
    expect(isDolbyVision('hevc', 'dolby vision')).toBe(true);
  });

  it('returns false for plain codecs', () => {
    expect(isDolbyVision('hevc', 'main 10')).toBe(false);
    expect(isDolbyVision('h264', 'high')).toBe(false);
  });
});

describe('isCodecSupported', () => {
  const device = ['video/hevc', 'audio/eac3'];

  it('returns true when the mapped mime is present on the device', () => {
    expect(isCodecSupported('hevc', device)).toBe(true);
    expect(isCodecSupported('eac3', device)).toBe(true);
  });

  it('returns false when the mapped mime is absent', () => {
    expect(isCodecSupported('av1', device)).toBe(false);
  });

  it('assumes supported for unknown codecs (no mime mapping)', () => {
    expect(isCodecSupported('made-up-codec', device)).toBe(true);
  });

  it('is case-insensitive on the codec name', () => {
    expect(isCodecSupported('HEVC', device)).toBe(true);
  });
});

describe('CODEC_MIME_MAP', () => {
  it('maps representative video and audio codecs', () => {
    expect(CODEC_MIME_MAP.hevc).toBe('video/hevc');
    expect(CODEC_MIME_MAP.h264).toBe('video/avc');
    expect(CODEC_MIME_MAP.dvhe).toBe('video/dolby-vision');
    expect(CODEC_MIME_MAP.eac3).toBe('audio/eac3');
    expect(CODEC_MIME_MAP.aac).toBe('audio/mp4a-latm');
  });
});
