import { describe, expect, it } from 'vitest';

import type { NativeDeviceCapabilities } from '@/plugins/NativeVideoPlugin';

import { nativeAudioGroupFor, pickPreferredAudioStream } from './audioTrackSelection';

const capabilities: NativeDeviceCapabilities = {
  hardwareVideoCodecs: ['video/avc'],
  softwareVideoCodecs: [],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3', 'audio/eac3-joc'],
  ffmpegAudioCodecs: ['audio/true-hd', 'audio/vnd.dts'],
  ffmpegVideoCodecs: [],
  displayWidth: 2408,
  displayHeight: 1720,
  manufacturer: 'OnePlus',
  model: 'OPD2304',
  androidApi: 34,
};

// Dune: Part Two layout.
const dune = [
  { Index: 1, Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos', Channels: 6, Language: 'fra', IsDefault: true },
  { Index: 2, Codec: 'truehd', Profile: 'Dolby TrueHD + Dolby Atmos', Channels: 8, Language: 'eng' },
  { Index: 3, Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos', Channels: 6, Language: 'eng' },
];

describe('pickPreferredAudioStream', () => {
  it('picks the preferred-language track this device decodes natively', () => {
    expect(pickPreferredAudioStream(dune, [null, 'eng'], capabilities)?.Index).toBe(3);
  });

  it('avoids E-AC3 Atmos when the platform E-AC3 decoder lacks JOC (Pixel)', () => {
    const pixel = { ...capabilities, platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3'] };
    expect(pickPreferredAudioStream(dune, ['eng'], pixel)?.Index).toBe(2);
  });

  it('never trades the preferred language for a better-supported track', () => {
    expect(pickPreferredAudioStream(dune, ['fra'], capabilities)?.Index).toBe(1);
  });

  it('gives the per-item language priority over the global one, in either code form', () => {
    expect(pickPreferredAudioStream(dune, ['fr', 'eng'], capabilities)?.Index).toBe(1);
  });

  it('prefers decodable Atmos, then more channels, among equally decodable tracks', () => {
    const streams = [
      { Index: 1, Codec: 'aac', Channels: 2, Language: 'fra', IsDefault: true },
      { Index: 2, Codec: 'ac3', Channels: 6, Language: 'fra' },
      { Index: 3, Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos', Channels: 6, Language: 'fra' },
    ];
    expect(pickPreferredAudioStream(streams, ['fra'], capabilities)?.Index).toBe(3);
    expect(pickPreferredAudioStream(
      streams,
      ['fra'],
      { ...capabilities, platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3'] },
    )?.Index).toBe(2);
  });

  it('skips commentary tracks unless nothing else matches the language', () => {
    const streams = [
      { Index: 1, Codec: 'aac', Channels: 2, Language: 'eng', DisplayTitle: 'Director Commentary - English - AAC' },
      { Index: 2, Codec: 'truehd', Channels: 8, Language: 'eng' },
    ];
    expect(pickPreferredAudioStream(streams, ['eng'], capabilities)?.Index).toBe(2);
    expect(pickPreferredAudioStream([streams[0]], ['eng'], capabilities)?.Index).toBe(1);
  });

  it('keeps the first language match when device capabilities are unavailable', () => {
    expect(pickPreferredAudioStream(dune, ['eng'], { ...capabilities, androidApi: 0 })?.Index).toBe(2);
  });

  it('falls back to the default-flagged track, then the first', () => {
    expect(pickPreferredAudioStream(dune, ['deu'], capabilities)?.Index).toBe(1);
    expect(pickPreferredAudioStream(dune.slice(1), [], capabilities)?.Index).toBe(2);
    expect(pickPreferredAudioStream([], ['eng'], capabilities)).toBeUndefined();
  });
});

describe('nativeAudioGroupFor', () => {
  const nativeGroups = [{ groupIndex: 1 }, { groupIndex: 2 }, { groupIndex: 3 }];

  it('maps a Jellyfin audio stream to the ExoPlayer group at the same position', () => {
    expect(nativeAudioGroupFor(dune, nativeGroups, 3)).toBe(3);
    expect(nativeAudioGroupFor(dune, [{ groupIndex: 4 }, { groupIndex: 5 }, { groupIndex: 6 }], 2)).toBe(5);
  });

  it('refuses to guess when the track lists differ or the stream is unknown', () => {
    expect(nativeAudioGroupFor(dune, nativeGroups.slice(1), 3)).toBeUndefined();
    expect(nativeAudioGroupFor(dune, nativeGroups, 9)).toBeUndefined();
    expect(nativeAudioGroupFor(dune, nativeGroups, undefined)).toBeUndefined();
  });
});
