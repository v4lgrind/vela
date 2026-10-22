import { Capacitor } from '@capacitor/core';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';

import type {
  NativeDeviceCapabilities,
  VideoDecodeResult,
} from '@/plugins/NativeVideoPlugin';
import type { MediaStream } from '@/types/jellyfin';

export const CODEC_MIME_MAP: Record<string, string> = {
  dvhe: 'video/dolby-vision',
  dvh1: 'video/dolby-vision',
  hevc: 'video/hevc',
  h265: 'video/hevc',
  h264: 'video/avc',
  avc: 'video/avc',
  vp8: 'video/x-vnd.on2.vp8',
  vp9: 'video/x-vnd.on2.vp9',
  av1: 'video/av01',
  mpeg4: 'video/mp4v-es',
  mpeg2video: 'video/mpeg2',
  ac3: 'audio/ac3',
  eac3: 'audio/eac3',
  dts: 'audio/vnd.dts',
  truehd: 'audio/true-hd',
  flac: 'audio/flac',
  opus: 'audio/opus',
  vorbis: 'audio/vorbis',
  aac: 'audio/mp4a-latm',
  mp3: 'audio/mpeg',
  mp2: 'audio/mpeg-l2',
  alac: 'audio/alac',
  pcm: 'audio/raw',
};

const EMPTY_CAPABILITIES: NativeDeviceCapabilities = {
  hardwareVideoCodecs: [],
  softwareVideoCodecs: [],
  platformAudioCodecs: [],
  ffmpegAudioCodecs: [],
  ffmpegVideoCodecs: [],
  displayWidth: 0,
  displayHeight: 0,
  manufacturer: '',
  model: '',
  androidApi: 0,
};

let deviceCapabilitiesPromise: Promise<NativeDeviceCapabilities> | null = null;

export async function getDeviceCapabilities(): Promise<NativeDeviceCapabilities> {
  if (!Capacitor.isNativePlatform()) return EMPTY_CAPABILITIES;
  if (!deviceCapabilitiesPromise) {
    deviceCapabilitiesPromise = NativeVideo.getDeviceCapabilities()
      .then((capabilities) => ({
        ...capabilities,
        hardwareVideoCodecs: capabilities.hardwareVideoCodecs.map(codec => codec.toLowerCase()),
        softwareVideoCodecs: capabilities.softwareVideoCodecs.map(codec => codec.toLowerCase()),
        platformAudioCodecs: capabilities.platformAudioCodecs.map(codec => codec.toLowerCase()),
        ffmpegAudioCodecs: capabilities.ffmpegAudioCodecs.map(codec => codec.toLowerCase()),
        ffmpegVideoCodecs: capabilities.ffmpegVideoCodecs.map(codec => codec.toLowerCase()),
      }))
      .catch(() => EMPTY_CAPABILITIES);
  }
  return deviceCapabilitiesPromise;
}

export function isDolbyVision(codec: string, profile: string): boolean {
  return codec.includes('dvhe') || codec.includes('dvh1') || profile.includes('dolby vision');
}

export function getVideoMime(stream: Pick<MediaStream, 'Codec' | 'Profile' | 'VideoRangeType'>): string | null {
  const codec = stream.Codec?.toLowerCase() || '';
  const profile = stream.Profile?.toLowerCase() || '';
  const rangeType = stream.VideoRangeType?.toLowerCase() || '';
  if (isDolbyVision(codec, profile) || rangeType.includes('dovi')) {
    return 'video/dolby-vision';
  }
  return CODEC_MIME_MAP[codec] || null;
}

export function isAudioStreamSupported(
  stream: Pick<MediaStream, 'Codec' | 'Profile'>,
  capabilities: NativeDeviceCapabilities,
): boolean {
  const codec = stream.Codec?.toLowerCase() || '';
  const mime = CODEC_MIME_MAP[codec];
  if (!mime) return false;

  const profile = stream.Profile?.toLowerCase() || '';
  // E-AC3 JOC (Atmos) needs a platform decoder that declares audio/eac3-joc.
  // A plain audio/eac3 decoder is not enough: the Pixel 10's Dolby decoder
  // (exposed only as audio/ac3 and audio/eac3) rejects JOC input with
  // CodecException 0x80000000 although Media3 reports the format supported.
  if (codec === 'eac3' && (profile.includes('atmos') || profile.includes('joc'))) {
    return capabilities.platformAudioCodecs.includes('audio/eac3-joc');
  }

  // AAC must use Android's MediaCodec renderer. FFmpeg remains available for
  // formats absent from the platform, but is not considered an AAC fallback.
  if (codec === 'aac') {
    return capabilities.platformAudioCodecs.includes(mime);
  }
  return capabilities.platformAudioCodecs.includes(mime)
    || capabilities.ffmpegAudioCodecs.includes(mime);
}

interface CodecListProfile {
  Type?: string;
  AudioCodec?: string;
}

function supportedAudioCodecs(codecList: string, capabilities: NativeDeviceCapabilities): string {
  return codecList
    .split(',')
    .filter(codec => isAudioStreamSupported({ Codec: codec }, capabilities))
    .join(',');
}

/**
 * Restrict the video profiles' audio codec lists to what this device decodes,
 * so Jellyfin never direct plays or stream-copies an undecodable audio track.
 * An empty AudioCodec means "any codec" to Jellyfin, so a DirectPlay profile
 * left without codecs is dropped and a transcode target falls back to AAC.
 */
export function withDeviceAudioCodecs<T extends {
  DirectPlayProfiles?: CodecListProfile[];
  TranscodingProfiles?: CodecListProfile[];
}>(deviceProfile: T, capabilities: NativeDeviceCapabilities): T {
  if (capabilities.androidApi <= 0) return deviceProfile;

  const directPlayProfiles = deviceProfile.DirectPlayProfiles
    ?.map(profile => (profile.Type === 'Video' && profile.AudioCodec
      ? { ...profile, AudioCodec: supportedAudioCodecs(profile.AudioCodec, capabilities) }
      : profile))
    .filter(profile => profile.AudioCodec !== '');
  const transcodingProfiles = deviceProfile.TranscodingProfiles
    ?.map(profile => (profile.Type === 'Video' && profile.AudioCodec
      ? { ...profile, AudioCodec: supportedAudioCodecs(profile.AudioCodec, capabilities) || 'aac' }
      : profile));
  return {
    ...deviceProfile,
    ...(directPlayProfiles ? { DirectPlayProfiles: directPlayProfiles } : {}),
    ...(transcodingProfiles ? { TranscodingProfiles: transcodingProfiles } : {}),
  };
}

/**
 * Make AAC the only audio target of video transcodes. When the source audio
 * must be re-encoded, a list like 'aac,eac3,ac3' lets Jellyfin keep the
 * source codec (E-AC3 Atmos) as the target; it then serves MP3 under an HLS
 * CODECS list without an audio codec, and ExoPlayer exposes no audio track.
 */
export function withAacTranscodeAudio<T extends { TranscodingProfiles?: CodecListProfile[] }>(
  deviceProfile: T,
): T {
  return {
    ...deviceProfile,
    TranscodingProfiles: deviceProfile.TranscodingProfiles
      ?.map(profile => (profile.Type === 'Video' ? { ...profile, AudioCodec: 'aac' } : profile)),
  };
}

export async function canHardwareDecodeVideo(stream: MediaStream): Promise<VideoDecodeResult> {
  const mime = getVideoMime(stream);
  if (!mime) {
    return { supported: false, decoderName: '', reason: 'unknown_video_codec' };
  }
  return NativeVideo.canDecodeVideo({
    mime,
    profile: stream.Profile,
    level: stream.Level,
    bitDepth: stream.BitDepth,
    width: stream.Width,
    height: stream.Height,
    frameRate: stream.RealFrameRate || stream.AverageFrameRate,
  });
}

export function canSoftwareDecodeVideo(
  stream: Pick<MediaStream, 'Codec' | 'Profile' | 'VideoRangeType'>,
  capabilities: NativeDeviceCapabilities,
): boolean {
  const mime = getVideoMime(stream);
  return Boolean(mime && capabilities.ffmpegVideoCodecs.includes(mime));
}

export function exceedsDeviceDisplay(
  stream: Pick<MediaStream, 'Width' | 'Height'>,
  capabilities: NativeDeviceCapabilities,
): boolean {
  const sourceWidth = stream.Width || 0;
  const sourceHeight = stream.Height || 0;
  if (
    sourceWidth <= 0
    || sourceHeight <= 0
    || capabilities.displayWidth <= 0
    || capabilities.displayHeight <= 0
  ) {
    return false;
  }

  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  const sourceShortEdge = Math.min(sourceWidth, sourceHeight);
  const displayLongEdge = Math.max(capabilities.displayWidth, capabilities.displayHeight);
  const displayShortEdge = Math.min(capabilities.displayWidth, capabilities.displayHeight);
  return sourceLongEdge > displayLongEdge || sourceShortEdge > displayShortEdge;
}

/**
 * Maximum transcode dimensions that fit the display, oriented like the source.
 * Returns null when the source already fits and no size limit is needed.
 */
export function getDisplayBoundsForSource(
  stream: Pick<MediaStream, 'Width' | 'Height'>,
  capabilities: NativeDeviceCapabilities,
): { maxWidth: number; maxHeight: number } | null {
  if (!exceedsDeviceDisplay(stream, capabilities)) return null;

  const displayLongEdge = Math.max(capabilities.displayWidth, capabilities.displayHeight);
  const displayShortEdge = Math.min(capabilities.displayWidth, capabilities.displayHeight);
  const isPortraitSource = (stream.Height || 0) > (stream.Width || 0);
  return isPortraitSource
    ? { maxWidth: displayShortEdge, maxHeight: displayLongEdge }
    : { maxWidth: displayLongEdge, maxHeight: displayShortEdge };
}

export function getRecommendedNativeTranscodeBitrate(
  capabilities: NativeDeviceCapabilities,
): number {
  if (capabilities.displayWidth <= 0 || capabilities.displayHeight <= 0) {
    return 20_000_000;
  }
  const shortEdge = Math.min(capabilities.displayWidth, capabilities.displayHeight);
  if (shortEdge >= 2160) return 80_000_000;
  if (shortEdge >= 1080) return 20_000_000;
  if (shortEdge >= 720) return 8_000_000;
  return 3_000_000;
}
