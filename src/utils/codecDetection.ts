import { Capacitor } from '@capacitor/core';

import { videoMime } from '@/domain';
import type { DeviceCapabilities, VideoStream } from '@/domain';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import type { NativeDeviceCapabilities, VideoDecodeResult } from '@/plugins/NativeVideoPlugin';

/**
 * Platform side of codec decisions: asks the device what it decodes. The rules
 * themselves are pure and live in `@/domain` (device.ts).
 */

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

const lower = (codecs: string[]) => codecs.map((codec) => codec.toLowerCase());

/** Raw native report (manufacturer, model and API level are useful in logs). */
export async function getDeviceCapabilities(): Promise<NativeDeviceCapabilities> {
  if (!Capacitor.isNativePlatform()) return EMPTY_CAPABILITIES;
  if (!deviceCapabilitiesPromise) {
    deviceCapabilitiesPromise = NativeVideo.getDeviceCapabilities()
      .then((capabilities) => ({
        ...capabilities,
        hardwareVideoCodecs: lower(capabilities.hardwareVideoCodecs),
        softwareVideoCodecs: lower(capabilities.softwareVideoCodecs),
        platformAudioCodecs: lower(capabilities.platformAudioCodecs),
        ffmpegAudioCodecs: lower(capabilities.ffmpegAudioCodecs),
        ffmpegVideoCodecs: lower(capabilities.ffmpegVideoCodecs),
      }))
      .catch(() => EMPTY_CAPABILITIES);
  }
  return deviceCapabilitiesPromise;
}

export function toDeviceCapabilities(native: NativeDeviceCapabilities): DeviceCapabilities {
  return {
    hardwareVideoCodecs: native.hardwareVideoCodecs,
    softwareVideoCodecs: native.softwareVideoCodecs,
    platformAudioCodecs: native.platformAudioCodecs,
    ffmpegAudioCodecs: native.ffmpegAudioCodecs,
    ffmpegVideoCodecs: native.ffmpegVideoCodecs,
    displayWidth: native.displayWidth,
    displayHeight: native.displayHeight,
    isKnown: native.androidApi > 0,
  };
}

/** What this device decodes, in domain terms (unknown on web and desktop). */
export async function deviceCapabilities(): Promise<DeviceCapabilities> {
  return toDeviceCapabilities(await getDeviceCapabilities());
}

/** Asks Android whether a hardware decoder accepts this exact stream (profile, level, size, frame rate). */
export async function canHardwareDecodeVideo(video: VideoStream): Promise<VideoDecodeResult> {
  const mime = videoMime(video);
  if (!mime) return { supported: false, decoderName: '', reason: 'unknown_video_codec' };
  return NativeVideo.canDecodeVideo({
    mime,
    profile: video.profile,
    level: video.level,
    bitDepth: video.bitDepth,
    width: video.width,
    height: video.height,
    frameRate: video.frameRate,
  });
}
