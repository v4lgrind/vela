import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';

import type { AudioStream, MediaVersion, SubtitleStream, VideoRange, VideoStream } from '@/domain';

import { list, opt, ticksToMs } from './common';

const IMAGE_SUBTITLE_CODECS = new Set(['pgssub', 'pgs', 'dvdsub', 'dvbsub', 'vobsub', 'hdmv_pgs_subtitle', 'dvd_subtitle']);

const RANGE_BY_TYPE: Record<string, VideoRange> = {
  SDR: 'sdr',
  HDR10: 'hdr10',
  HDR10Plus: 'hdr10+',
  HLG: 'hlg',
};

/** Stream ids are Jellyfin stream indexes, as strings. */
export function streamId(stream: MediaStream): string {
  return String(stream.Index ?? 0);
}

export function videoRange(stream: Pick<MediaStream, 'VideoRangeType' | 'VideoRange'>): VideoRange {
  const type = stream.VideoRangeType ?? '';
  if (type.startsWith('DOVI')) return 'dolby-vision';
  if (RANGE_BY_TYPE[type]) return RANGE_BY_TYPE[type];
  return stream.VideoRange === 'SDR' ? 'sdr' : 'unknown';
}

function toVideoStream(stream: MediaStream): VideoStream {
  const range = videoRange(stream);
  return {
    id: streamId(stream),
    codec: opt(stream.Codec),
    profile: opt(stream.Profile),
    level: opt(stream.Level),
    width: opt(stream.Width),
    height: opt(stream.Height),
    bitDepth: opt(stream.BitDepth),
    frameRate: opt(stream.RealFrameRate ?? stream.AverageFrameRate),
    bitrate: opt(stream.BitRate),
    range,
    dolbyVisionProfile: range === 'dolby-vision' ? opt(stream.DvProfile) : undefined,
    dolbyVisionLevel: range === 'dolby-vision' ? opt(stream.DvLevel) : undefined,
    aspectRatio: opt(stream.AspectRatio),
    isInterlaced: opt(stream.IsInterlaced),
    pixelFormat: opt(stream.PixelFormat),
    refFrames: opt(stream.RefFrames),
    colorSpace: opt(stream.ColorSpace),
    colorTransfer: opt(stream.ColorTransfer),
    colorPrimaries: opt(stream.ColorPrimaries),
  };
}

function toAudioStream(stream: MediaStream): AudioStream {
  return {
    id: streamId(stream),
    language: opt(stream.Language),
    title: opt(stream.DisplayTitle ?? stream.Title),
    codec: opt(stream.Codec),
    profile: opt(stream.Profile),
    channels: opt(stream.Channels),
    channelLayout: opt(stream.ChannelLayout),
    bitrate: opt(stream.BitRate),
    sampleRate: opt(stream.SampleRate),
    isDefault: stream.IsDefault === true,
  };
}

function isImageSubtitle(stream: MediaStream): boolean {
  if (stream.IsTextSubtitleStream != null) return !stream.IsTextSubtitleStream;
  return IMAGE_SUBTITLE_CODECS.has((stream.Codec ?? '').toLowerCase());
}

function toSubtitleStream(stream: MediaStream): SubtitleStream {
  return {
    id: streamId(stream),
    language: opt(stream.Language),
    title: opt(stream.DisplayTitle ?? stream.Title),
    codec: opt(stream.Codec),
    isDefault: stream.IsDefault === true,
    isForced: stream.IsForced === true,
    isHearingImpaired: stream.IsHearingImpaired === true,
    isExternal: stream.IsExternal === true,
    format: isImageSubtitle(stream) ? 'image' : 'text',
  };
}

export function toMediaVersion(source: MediaSourceInfo, fallbackId: string): MediaVersion {
  const streams = list(source.MediaStreams);
  return {
    id: source.Id ?? fallbackId,
    name: opt(source.Name),
    path: opt(source.Path),
    container: opt(source.Container),
    sizeBytes: opt(source.Size),
    bitrate: opt(source.Bitrate),
    durationMs: ticksToMs(source.RunTimeTicks),
    video: streams.filter((s) => s.Type === 'Video').map(toVideoStream),
    audio: streams.filter((s) => s.Type === 'Audio').map(toAudioStream),
    subtitles: streams.filter((s) => s.Type === 'Subtitle').map(toSubtitleStream),
  };
}

/** Items fetched without MediaSources still carry MediaStreams: expose them as one version. */
export function toMediaVersions(
  item: { Id?: string | null; MediaSources?: MediaSourceInfo[] | null; MediaStreams?: MediaStream[] | null; RunTimeTicks?: number | null },
): MediaVersion[] {
  const id = item.Id ?? '';
  if (item.MediaSources?.length) return item.MediaSources.map((source) => toMediaVersion(source, id));
  if (!item.MediaStreams?.length) return [];
  return [toMediaVersion({ Id: id, MediaStreams: item.MediaStreams, RunTimeTicks: item.RunTimeTicks }, id)];
}
