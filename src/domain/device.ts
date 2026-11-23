import type { DeviceCapabilities } from './playback';
import type { VideoRange, VideoStream } from './streams';

/** Codec names as servers report them → Android MediaCodec MIME types. */
export const CODEC_MIME: Record<string, string> = {
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

const DEFAULT_TRANSCODE_BITRATE = 20_000_000;
const BITRATE_BY_SHORT_EDGE: [number, number][] = [[2160, 80_000_000], [1080, 20_000_000], [720, 8_000_000]];
const LOW_TRANSCODE_BITRATE = 3_000_000;

export function isDolbyVision(codec: string, profile: string): boolean {
  return codec.includes('dvhe') || codec.includes('dvh1') || profile.includes('dolby vision');
}

export function videoMime(stream: { codec?: string; profile?: string; range?: VideoRange }): string | null {
  const codec = stream.codec?.toLowerCase() || '';
  const profile = stream.profile?.toLowerCase() || '';
  if (isDolbyVision(codec, profile) || stream.range === 'dolby-vision') return 'video/dolby-vision';
  return CODEC_MIME[codec] || null;
}

/**
 * Whether the device decodes an audio codec. E-AC3 JOC (Atmos) needs a decoder
 * declaring audio/eac3-joc: a plain audio/eac3 decoder (e.g. the Pixel 10's)
 * rejects JOC input although Media3 reports the format supported. AAC must use
 * the platform decoder; FFmpeg is not an AAC fallback.
 */
export function isAudioCodecSupported(codecName: string | undefined, profileName: string | undefined, device: DeviceCapabilities): boolean {
  const codec = codecName?.toLowerCase() || '';
  const mime = CODEC_MIME[codec];
  if (!mime) return false;
  const profile = profileName?.toLowerCase() || '';
  if (codec === 'eac3' && (profile.includes('atmos') || profile.includes('joc'))) {
    return device.platformAudioCodecs.includes('audio/eac3-joc');
  }
  if (codec === 'aac') return device.platformAudioCodecs.includes(mime);
  return device.platformAudioCodecs.includes(mime) || device.ffmpegAudioCodecs.includes(mime);
}

type Size = Pick<VideoStream, 'width' | 'height'>;

function edges(width: number, height: number): { long: number; short: number } {
  return { long: Math.max(width, height), short: Math.min(width, height) };
}

export function exceedsDisplay(video: Size, device: DeviceCapabilities): boolean {
  const width = video.width || 0;
  const height = video.height || 0;
  if (width <= 0 || height <= 0 || device.displayWidth <= 0 || device.displayHeight <= 0) return false;
  const source = edges(width, height);
  const display = edges(device.displayWidth, device.displayHeight);
  return source.long > display.long || source.short > display.short;
}

/** Largest transcode size that fits the display, oriented like the source; null when it already fits. */
export function displayBoundsFor(video: Size, device: DeviceCapabilities): { width: number; height: number } | null {
  if (!exceedsDisplay(video, device)) return null;
  const display = edges(device.displayWidth, device.displayHeight);
  const isPortrait = (video.height || 0) > (video.width || 0);
  return isPortrait ? { width: display.short, height: display.long } : { width: display.long, height: display.short };
}

/** Bitrate for an automatic transcode, sized to the display. */
export function recommendedTranscodeBitrate(device: DeviceCapabilities): number {
  if (device.displayWidth <= 0 || device.displayHeight <= 0) return DEFAULT_TRANSCODE_BITRATE;
  const short = Math.min(device.displayWidth, device.displayHeight);
  return BITRATE_BY_SHORT_EDGE.find(([edge]) => short >= edge)?.[1] ?? LOW_TRANSCODE_BITRATE;
}
