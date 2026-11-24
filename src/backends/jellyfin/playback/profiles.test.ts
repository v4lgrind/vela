import { describe, expect, it } from 'vitest';

import type { DeviceCapabilities } from '@/domain';

import { withAacTranscodeAudio, withDeviceAudioCodecs } from './profiles';

const device: DeviceCapabilities = {
  hardwareVideoCodecs: [], softwareVideoCodecs: [],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/eac3'],
  ffmpegAudioCodecs: ['audio/eac3', 'audio/vnd.dts', 'audio/true-hd'],
  ffmpegVideoCodecs: [], displayWidth: 2408, displayHeight: 1720, isKnown: true,
};

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
    const result = withDeviceAudioCodecs(profile, device);
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
    const result = withDeviceAudioCodecs({ TranscodingProfiles: [{ Container: 'ts', Type: 'Video', AudioCodec: 'ac3' }] }, device);
    expect(result.TranscodingProfiles).toEqual([{ Container: 'ts', Type: 'Video', AudioCodec: 'aac' }]);
  });

  it('leaves the profile unchanged when device capabilities are unavailable', () => {
    expect(withDeviceAudioCodecs(profile, { ...device, isKnown: false })).toBe(profile);
  });
});

describe('withAacTranscodeAudio', () => {
  it('makes AAC the only audio target of video transcodes', () => {
    // With 'aac,eac3,ac3' Jellyfin keeps an E-AC3 Atmos source's codec as the
    // target, then serves MP3 under an HLS CODECS list with no audio codec.
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
