import { describe, expect, it } from 'vitest';

import type { DeviceCapabilities } from '@/domain';

import { nativeAudioGroupFor, pickPreferredAudioStream } from './audioTrackSelection';

const capabilities: DeviceCapabilities = {
  hardwareVideoCodecs: ['video/avc'],
  softwareVideoCodecs: [],
  platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3', 'audio/eac3-joc'],
  ffmpegAudioCodecs: ['audio/true-hd', 'audio/vnd.dts'],
  ffmpegVideoCodecs: [],
  displayWidth: 2408,
  displayHeight: 1720,
  isKnown: true,
};

// Dune: Part Two layout.
const dune = [
  { id: '1', isDefault: true, codec: 'eac3', profile: 'Dolby Digital Plus + Dolby Atmos', channels: 6, language: 'fra' },
  { id: '2', isDefault: false, codec: 'truehd', profile: 'Dolby TrueHD + Dolby Atmos', channels: 8, language: 'eng' },
  { id: '3', isDefault: false, codec: 'eac3', profile: 'Dolby Digital Plus + Dolby Atmos', channels: 6, language: 'eng' },
];

describe('pickPreferredAudioStream', () => {
  it('picks the preferred-language track this device decodes natively', () => {
    expect(pickPreferredAudioStream(dune, [null, 'eng'], capabilities)?.id).toBe('3');
  });

  it('avoids E-AC3 Atmos when the platform E-AC3 decoder lacks JOC (Pixel)', () => {
    const pixel = { ...capabilities, platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3'] };
    expect(pickPreferredAudioStream(dune, ['eng'], pixel)?.id).toBe('2');
  });

  it('never trades the preferred language for a better-supported track', () => {
    expect(pickPreferredAudioStream(dune, ['fra'], capabilities)?.id).toBe('1');
  });

  it('gives the per-item language priority over the global one, in either code form', () => {
    expect(pickPreferredAudioStream(dune, ['fr', 'eng'], capabilities)?.id).toBe('1');
  });

  it('prefers decodable Atmos, then more channels, among equally decodable tracks', () => {
    const streams = [
      { id: '1', isDefault: true, codec: 'aac', channels: 2, language: 'fra' },
      { id: '2', isDefault: false, codec: 'ac3', channels: 6, language: 'fra' },
      { id: '3', isDefault: false, codec: 'eac3', profile: 'Dolby Digital Plus + Dolby Atmos', channels: 6, language: 'fra' },
    ];
    expect(pickPreferredAudioStream(streams, ['fra'], capabilities)?.id).toBe('3');
    expect(pickPreferredAudioStream(
      streams,
      ['fra'],
      { ...capabilities, platformAudioCodecs: ['audio/mp4a-latm', 'audio/ac3', 'audio/eac3'] },
    )?.id).toBe('2');
  });

  it('skips commentary tracks unless nothing else matches the language', () => {
    const streams = [
      { id: '1', isDefault: false, codec: 'aac', channels: 2, language: 'eng', title: 'Director Commentary - English - AAC' },
      { id: '2', isDefault: false, codec: 'truehd', channels: 8, language: 'eng' },
    ];
    expect(pickPreferredAudioStream(streams, ['eng'], capabilities)?.id).toBe('2');
    expect(pickPreferredAudioStream([streams[0]], ['eng'], capabilities)?.id).toBe('1');
  });

  it('keeps the first language match when device capabilities are unavailable', () => {
    expect(pickPreferredAudioStream(dune, ['eng'], { ...capabilities, isKnown: false })?.id).toBe('2');
  });

  it('falls back to the default-flagged track, then the first', () => {
    expect(pickPreferredAudioStream(dune, ['deu'], capabilities)?.id).toBe('1');
    expect(pickPreferredAudioStream(dune.slice(1), [], capabilities)?.id).toBe('2');
    expect(pickPreferredAudioStream([], ['eng'], capabilities)).toBeUndefined();
  });
});

describe('nativeAudioGroupFor', () => {
  const nativeGroups = [{ groupIndex: 1 }, { groupIndex: 2 }, { groupIndex: 3 }];

  it('maps a Jellyfin audio stream to the ExoPlayer group at the same position', () => {
    expect(nativeAudioGroupFor(dune, nativeGroups, '3')).toBe(3);
    expect(nativeAudioGroupFor(dune, [{ groupIndex: 4 }, { groupIndex: 5 }, { groupIndex: 6 }], '2')).toBe(5);
  });

  it('refuses to guess when the track lists differ or the stream is unknown', () => {
    expect(nativeAudioGroupFor(dune, nativeGroups.slice(1), '3')).toBeUndefined();
    expect(nativeAudioGroupFor(dune, nativeGroups, '9')).toBeUndefined();
    expect(nativeAudioGroupFor(dune, nativeGroups, undefined)).toBeUndefined();
  });
});
