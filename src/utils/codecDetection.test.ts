import { describe, expect, it } from 'vitest';

import type { NativeDeviceCapabilities } from '@/plugins/NativeVideoPlugin';

import {
  CODEC_MIME_MAP,
  canSoftwareDecodeVideo,
  exceedsDeviceDisplay,
  getDisplayBoundsForSource,
  getRecommendedNativeTranscodeBitrate,
  getVideoMime,
  isAudioStreamSupported,
  isDolbyVision,
  withAacTranscodeAudio,
  withDeviceAudioCodecs,
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

  it('requires a platform decoder declaring E-AC3 JOC for Atmos', () => {
    const atmos = { Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos' };
    // Plain platform E-AC3 decoder (Pixel 10 Dolby decoder) fails on JOC input.
    expect(isAudioStreamSupported(atmos, capabilities)).toBe(false);
    expect(isAudioStreamSupported(
      atmos,
      { ...capabilities, platformAudioCodecs: ['audio/mp4a-latm', 'audio/eac3-joc'] },
    )).toBe(true);
    // Plain E-AC3 still plays on the same decoder.
    expect(isAudioStreamSupported({ Codec: 'eac3' }, capabilities)).toBe(true);
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

  it('transcodes sources larger than the rotation-normalized display', () => {
    expect(exceedsDeviceDisplay({ Width: 3840, Height: 1636 }, capabilities)).toBe(true);
    expect(exceedsDeviceDisplay({ Width: 1920, Height: 1080 }, capabilities)).toBe(false);
    expect(exceedsDeviceDisplay(
      { Width: 3840, Height: 1636 },
      { ...capabilities, displayWidth: 1080, displayHeight: 2424 },
    )).toBe(true);
    expect(exceedsDeviceDisplay({ Width: 0, Height: 0 }, capabilities)).toBe(false);
  });

  it('bounds oversized sources to the display in the source orientation', () => {
    expect(getDisplayBoundsForSource({ Width: 3840, Height: 1636 }, capabilities))
      .toEqual({ maxWidth: 2408, maxHeight: 1720 });
    expect(getDisplayBoundsForSource(
      { Width: 3840, Height: 1636 },
      { ...capabilities, displayWidth: 1080, displayHeight: 2424 },
    )).toEqual({ maxWidth: 2424, maxHeight: 1080 });
    expect(getDisplayBoundsForSource({ Width: 2160, Height: 3840 }, capabilities))
      .toEqual({ maxWidth: 1720, maxHeight: 2408 });
    expect(getDisplayBoundsForSource({ Width: 1920, Height: 1080 }, capabilities)).toBeNull();
  });
});

describe('withDeviceAudioCodecs', () => {
  const profile = {
    DirectPlayProfiles: [
      { Container: 'webm', Type: 'Video', AudioCodec: 'vorbis,opus' },
      { Container: 'mkv', Type: 'Video', AudioCodec: 'aac,mp3,ac3,eac3,dts,truehd' },
      { Container: 'flac', Type: 'Audio' },
    ],
    TranscodingProfiles: [
      { Container: 'ts', Type: 'Video', AudioCodec: 'aac,ac3' },
      { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3' },
    ],
  };

  it('advertises only the audio codecs this device can decode', () => {
    const result = withDeviceAudioCodecs(profile, capabilities);
    expect(result.DirectPlayProfiles).toEqual([
      { Container: 'mkv', Type: 'Video', AudioCodec: 'aac,eac3,dts,truehd' },
      { Container: 'flac', Type: 'Audio' },
    ]);
    expect(result.TranscodingProfiles).toEqual([
      { Container: 'ts', Type: 'Video', AudioCodec: 'aac' },
      { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3' },
    ]);
  });

  it('keeps AAC as the transcode target when no listed codec is supported', () => {
    const result = withDeviceAudioCodecs(
      { TranscodingProfiles: [{ Container: 'ts', Type: 'Video', AudioCodec: 'ac3' }] },
      capabilities,
    );
    expect(result.TranscodingProfiles).toEqual([{ Container: 'ts', Type: 'Video', AudioCodec: 'aac' }]);
  });

  it('leaves the profile unchanged when device capabilities are unavailable', () => {
    expect(withDeviceAudioCodecs(profile, { ...capabilities, androidApi: 0 })).toBe(profile);
  });
});

describe('withAacTranscodeAudio', () => {
  it('makes AAC the only audio target of video transcodes', () => {
    // With 'aac,eac3,ac3' Jellyfin keeps an E-AC3 Atmos source's codec as the
    // target, then serves MP3 under an HLS CODECS list with no audio codec, so
    // ExoPlayer exposes no audio track.
    const result = withAacTranscodeAudio({
      TranscodingProfiles: [
        { Container: 'ts', Type: 'Video', AudioCodec: 'aac,eac3,ac3' },
        { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3' },
      ],
    });
    expect(result.TranscodingProfiles).toEqual([
      { Container: 'ts', Type: 'Video', AudioCodec: 'aac' },
      { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3' },
    ]);
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
