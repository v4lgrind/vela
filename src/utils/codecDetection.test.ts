import { describe, expect, it } from 'vitest';

import type { NativeDeviceCapabilities } from '@/plugins/NativeVideoPlugin';

import {
  CODEC_MIME_MAP,
  canSoftwareDecodeVideo,
  getRecommendedNativeTranscodeBitrate,
  getVideoMime,
  isAudioStreamSupported,
  isDolbyVision,
} from './codecDetection';

const capabilities: NativeDeviceCapabilities = {
  hardwareVideoCodecs: ['video/avc', 'video/hevc'],
  softwareVideoCodecs: ['video/av01'],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/eac3'],
  ffmpegAudioCodecs: ['audio/eac3', 'audio/vnd.dts', 'audio/true-hd'],
  ffmpegVideoCodecs: ['video/avc', 'video/hevc'],
  displayWidth: 2408,
  displayHeight: 1720,
  manufacturer: 'OnePlus',
  model: 'OPD2304',
  androidApi: 34,
};

describe('isDolbyVision', () => {
  it('detects Dolby Vision by codec or profile', () => {
    expect(isDolbyVision('dvhe', '')).toBe(true);
    expect(isDolbyVision('dvh1', '')).toBe(true);
    expect(isDolbyVision('hevc', 'dolby vision')).toBe(true);
  });

  it('rejects plain HEVC and H.264 profiles', () => {
    expect(isDolbyVision('hevc', 'main 10')).toBe(false);
    expect(isDolbyVision('h264', 'high')).toBe(false);
  });
});

describe('device codec decisions', () => {
  it('requires Android MediaCodec for AAC instead of FFmpeg', () => {
    expect(isAudioStreamSupported({ Codec: 'aac' }, capabilities)).toBe(true);
    expect(isAudioStreamSupported(
      { Codec: 'aac' },
      { ...capabilities, platformAudioCodecs: [] },
    )).toBe(false);
  });

  it('requires explicit platform support for E-AC3 Atmos/JOC', () => {
    expect(isAudioStreamSupported(
      { Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos' },
      capabilities,
    )).toBe(false);
    expect(isAudioStreamSupported(
      { Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos' },
      { ...capabilities, platformAudioCodecs: [...capabilities.platformAudioCodecs, 'audio/eac3-joc'] },
    )).toBe(true);
  });

  it('uses FFmpeg only for non-AAC audio absent from MediaCodec', () => {
    expect(isAudioStreamSupported({ Codec: 'dts' }, capabilities)).toBe(true);
    expect(isAudioStreamSupported({ Codec: 'made-up-codec' }, capabilities)).toBe(false);
  });

  it('maps Dolby Vision range metadata and FFmpeg video support', () => {
    expect(getVideoMime({ Codec: 'hevc', VideoRangeType: 'DOVIWithHDR10' }))
      .toBe('video/dolby-vision');
    expect(canSoftwareDecodeVideo({ Codec: 'hevc' }, capabilities)).toBe(true);
    expect(canSoftwareDecodeVideo({ Codec: 'av1' }, capabilities)).toBe(false);
  });

  it('caps automatic transcodes to the physical display class', () => {
    expect(getRecommendedNativeTranscodeBitrate(capabilities)).toBe(20_000_000);
    expect(getRecommendedNativeTranscodeBitrate({
      ...capabilities,
      displayWidth: 1280,
      displayHeight: 720,
    })).toBe(8_000_000);
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
