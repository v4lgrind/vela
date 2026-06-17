import { Capacitor } from '@capacitor/core';

export const CODEC_MIME_MAP: Record<string, string> = {
  // Video
  dvhe: 'video/dolby-vision',
  dvh1: 'video/dolby-vision',
  hevc: 'video/hevc',
  h265: 'video/hevc',
  h264: 'video/avc',
  avc: 'video/avc',
  vp8: 'video/x-vnd.on2.vp8',
  vp9: 'video/x-vnd.on2.vp9',
  av1: 'video/av01',
  // Audio
  ac3: 'audio/ac3',
  eac3: 'audio/eac3',
  dts: 'audio/vnd.dts',
  truehd: 'audio/true-hd',
  flac: 'audio/flac',
  opus: 'audio/opus',
  vorbis: 'audio/vorbis',
  aac: 'audio/mp4a-latm',
  mp3: 'audio/mpeg',
};

let _deviceCodecsCache: string[] | null = null;

export async function getDeviceCodecs(): Promise<string[]> {
  if (_deviceCodecsCache) return _deviceCodecsCache;
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { NativeVideo } = await import('@/plugins/NativeVideoPlugin');
    const result = await NativeVideo.getDeviceCodecs();
    _deviceCodecsCache = result.codecs || [];
    return _deviceCodecsCache;
  } catch {
    return [];
  }
}

export function isCodecSupported(jellyfinCodec: string, deviceCodecs: string[]): boolean {
  const mime = CODEC_MIME_MAP[jellyfinCodec?.toLowerCase()];
  if (!mime) return true;
  return deviceCodecs.includes(mime);
}

export function isDolbyVision(codec: string, profile: string): boolean {
  return codec.includes('dvhe') || codec.includes('dvh1') || profile.includes('dolby vision');
}
