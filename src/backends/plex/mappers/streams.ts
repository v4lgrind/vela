import type { AudioStream, MediaVersion, SubtitleStream, VideoRange, VideoStream } from '@/domain';

import type { PlexMedia, PlexStream } from '../types';

const KBPS = 1000;
const IMAGE_SUBTITLE_CODECS = new Set(['pgs', 'vobsub', 'dvd_subtitle', 'hdmv_pgs_subtitle', 'dvb_subtitle']);

const RANGE_BY_TRANSFER: Record<string, VideoRange> = {
  smpte2084: 'hdr10',
  'arib-std-b67': 'hlg',
};

function kbpsToBps(kbps: number | undefined): number | undefined {
  return kbps === undefined ? undefined : kbps * KBPS;
}

export function videoRange(stream: Pick<PlexStream, 'colorTrc' | 'DOVIPresent'>): VideoRange {
  if (stream.DOVIPresent) return 'dolby-vision';
  return RANGE_BY_TRANSFER[stream.colorTrc ?? ''] ?? 'sdr';
}

function toVideoStream(stream: PlexStream, aspectRatio?: number): VideoStream {
  const range = videoRange(stream);
  return {
    id: String(stream.id),
    codec: stream.codec,
    profile: stream.profile,
    level: stream.level,
    width: stream.width,
    height: stream.height,
    bitDepth: stream.bitDepth,
    frameRate: stream.frameRate,
    bitrate: kbpsToBps(stream.bitrate),
    range,
    dolbyVisionProfile: range === 'dolby-vision' ? stream.DOVIProfile : undefined,
    aspectRatio: aspectRatio === undefined ? undefined : String(aspectRatio),
    isInterlaced: stream.scanType === undefined ? undefined : stream.scanType === 'interlaced',
    pixelFormat: stream.chromaSubsampling,
    refFrames: stream.refFrames,
    colorSpace: stream.colorSpace,
    colorTransfer: stream.colorTrc,
    colorPrimaries: stream.colorPrimaries,
  };
}

function toAudioStream(stream: PlexStream): AudioStream {
  return {
    id: String(stream.id),
    language: stream.languageCode,
    title: stream.title ?? stream.displayTitle,
    codec: stream.codec,
    profile: stream.profile,
    channels: stream.channels,
    channelLayout: stream.audioChannelLayout,
    bitrate: kbpsToBps(stream.bitrate),
    sampleRate: stream.samplingRate,
    isDefault: stream.default === true,
  };
}

function toSubtitleStream(stream: PlexStream): SubtitleStream {
  return {
    id: String(stream.id),
    language: stream.languageCode,
    title: stream.title ?? stream.displayTitle,
    codec: stream.codec,
    isDefault: stream.default === true,
    isForced: stream.forced === true,
    isHearingImpaired: stream.hearingImpaired === true,
    isExternal: stream.key !== undefined,
    format: IMAGE_SUBTITLE_CODECS.has(stream.codec ?? '') ? 'image' : 'text',
  };
}

/** One Plex `Media` (a file or edition) is one version; multi-part files are summed. */
export function toMediaVersion(media: PlexMedia): MediaVersion {
  const parts = media.Part ?? [];
  const streams = parts[0]?.Stream ?? [];
  const sizes = parts.map((part) => part.size).filter((size): size is number => size !== undefined);
  return {
    id: String(media.id),
    name: media.editionTitle ?? media.videoResolution,
    path: parts[0]?.file,
    streamRef: parts[0]?.key,
    container: media.container,
    sizeBytes: sizes.length ? sizes.reduce((a, b) => a + b, 0) : undefined,
    bitrate: kbpsToBps(media.bitrate),
    durationMs: media.duration,
    video: streams.filter((s) => s.streamType === 1).map((s) => toVideoStream(s, media.aspectRatio)),
    audio: streams.filter((s) => s.streamType === 2).map(toAudioStream),
    subtitles: streams.filter((s) => s.streamType === 3).map(toSubtitleStream),
  };
}

/** Tracks expose lyrics as a stream of type 4. */
export function hasLyricsStream(media: PlexMedia[] | undefined): boolean {
  return (media ?? []).some((m) => (m.Part ?? []).some((p) => (p.Stream ?? []).some((s) => s.streamType === 4)));
}
