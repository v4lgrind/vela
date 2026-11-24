import { describe, expect, it } from 'vitest';

import {
  CODEC_MIME,
  canSoftwareDecode,
  displayBoundsFor,
  exceedsDisplay,
  isAudioCodecSupported,
  isDolbyVision,
  recommendedTranscodeBitrate,
  videoMime,
} from './device';
import type { DeviceCapabilities } from './playback';

const device: DeviceCapabilities = {
  hardwareVideoCodecs: ['video/avc', 'video/hevc'],
  softwareVideoCodecs: ['video/av01'],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/eac3'],
  ffmpegAudioCodecs: ['audio/eac3', 'audio/vnd.dts', 'audio/true-hd'],
  ffmpegVideoCodecs: ['video/avc', 'video/hevc'],
  displayWidth: 2408,
  displayHeight: 1720,
  isKnown: true,
};

describe('isDolbyVision', () => {
  it('detects Dolby Vision by codec or profile, not plain HEVC/H.264', () => {
    expect(isDolbyVision('dvhe', '')).toBe(true);
    expect(isDolbyVision('dvh1', '')).toBe(true);
    expect(isDolbyVision('hevc', 'dolby vision')).toBe(true);
    expect(isDolbyVision('hevc', 'main 10')).toBe(false);
    expect(isDolbyVision('h264', 'high')).toBe(false);
  });
});

describe('audio decoding', () => {
  it('requires Android MediaCodec for AAC instead of FFmpeg', () => {
    expect(isAudioCodecSupported('aac', undefined, device)).toBe(true);
    expect(isAudioCodecSupported('aac', undefined, { ...device, platformAudioCodecs: [] })).toBe(false);
  });

  it('requires a platform decoder declaring E-AC3 JOC for Atmos', () => {
    // Plain platform E-AC3 decoder (Pixel 10 Dolby decoder) fails on JOC input.
    expect(isAudioCodecSupported('eac3', 'Dolby Digital Plus + Dolby Atmos', device)).toBe(false);
    expect(isAudioCodecSupported('eac3', 'Dolby Digital Plus + Dolby Atmos',
      { ...device, platformAudioCodecs: ['audio/mp4a-latm', 'audio/eac3-joc'] })).toBe(true);
    expect(isAudioCodecSupported('eac3', undefined, device)).toBe(true);
  });

  it('uses FFmpeg only for non-AAC audio absent from MediaCodec', () => {
    expect(isAudioCodecSupported('dts', undefined, device)).toBe(true);
    expect(isAudioCodecSupported('made-up-codec', undefined, device)).toBe(false);
  });
});

describe('video decoding and display', () => {
  it('maps Dolby Vision range metadata and FFmpeg video support', () => {
    expect(videoMime({ codec: 'hevc', range: 'dolby-vision' })).toBe('video/dolby-vision');
    expect(canSoftwareDecode({ codec: 'hevc', range: 'sdr' }, device)).toBe(true);
    expect(canSoftwareDecode({ codec: 'av1', range: 'sdr' }, device)).toBe(false);
  });

  it('caps automatic transcodes to the physical display class', () => {
    expect(recommendedTranscodeBitrate(device)).toBe(20_000_000);
    expect(recommendedTranscodeBitrate({ ...device, displayWidth: 1280, displayHeight: 720 })).toBe(8_000_000);
  });

  it('transcodes sources larger than the rotation-normalized display', () => {
    expect(exceedsDisplay({ width: 3840, height: 1636 }, device)).toBe(true);
    expect(exceedsDisplay({ width: 1920, height: 1080 }, device)).toBe(false);
    expect(exceedsDisplay({ width: 3840, height: 1636 }, { ...device, displayWidth: 1080, displayHeight: 2424 })).toBe(true);
    expect(exceedsDisplay({ width: 0, height: 0 }, device)).toBe(false);
  });

  it('bounds oversized sources to the display in the source orientation', () => {
    expect(displayBoundsFor({ width: 3840, height: 1636 }, device)).toEqual({ width: 2408, height: 1720 });
    expect(displayBoundsFor({ width: 3840, height: 1636 }, { ...device, displayWidth: 1080, displayHeight: 2424 }))
      .toEqual({ width: 2424, height: 1080 });
    expect(displayBoundsFor({ width: 2160, height: 3840 }, device)).toEqual({ width: 1720, height: 2408 });
    expect(displayBoundsFor({ width: 1920, height: 1080 }, device)).toBeNull();
  });

  it('maps representative codecs to MIME types', () => {
    expect(CODEC_MIME.hevc).toBe('video/hevc');
    expect(CODEC_MIME.h264).toBe('video/avc');
    expect(CODEC_MIME.dvhe).toBe('video/dolby-vision');
    expect(CODEC_MIME.eac3).toBe('audio/eac3');
    expect(CODEC_MIME.aac).toBe('audio/mp4a-latm');
  });
});
