import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

import { isAudioCodecSupported } from '@/domain';
import type { DeviceCapabilities, DownloadPlan, DownloadRequest, DownloadSidecar, MediaItem } from '@/domain';

import type { JellyfinClient } from './client';
import { fetchMarkers } from './playback/session';

const SUBTITLE_PROFILES = ['srt', 'subrip', 'ass', 'ssa', 'pgs', 'pgssub'].map((Format) => ({ Format, Method: 'External' }));
const FALLBACK_EXTENSION: Partial<Record<MediaItem['kind'], string>> = { movie: 'mkv', episode: 'mkv', track: 'mp3' };

/** Forces encoder bitrate and frame size on a stream URL, replacing any existing values. */
export function withForcedVideoParams(rawUrl: string, videoBitrate: number, height: number, width = Math.round((height * 16) / 9)): string {
  try {
    const url = new URL(rawUrl);
    const setParam = (key: string, value: string) => {
      for (const existing of [...url.searchParams.keys()]) {
        if (existing.toLowerCase() === key.toLowerCase()) url.searchParams.delete(existing);
      }
      url.searchParams.set(key, value);
    };
    setParam('videoBitRate', String(videoBitrate));
    if (height > 0) {
      setParam('maxHeight', String(height));
      setParam('maxWidth', String(width));
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** A container usable as a file extension ("mov,mp4,m4a" is an ffprobe list). */
function primaryContainer(container: string | undefined): string | undefined {
  const first = container?.toLowerCase().split(',').map((token) => token.trim()).find(Boolean);
  return first === 'matroska' ? 'mkv' : first;
}

function withoutQueryToken(url: URL): string {
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === 'api_key' || key.toLowerCase() === 'apikey') url.searchParams.delete(key);
  }
  return url.toString();
}

/** Only stream-copy audio this device decodes offline. */
function decodableAudio(codecs: string, device: DeviceCapabilities | undefined): string {
  if (!device?.isKnown) return codecs;
  return codecs.split(',').filter((codec) => isAudioCodecSupported(codec, undefined, device)).join(',') || 'aac';
}

function transcodeBody(request: DownloadRequest, container: string) {
  const isDesktop = request.target === 'desktop';
  const transcode = request.transcode ?? {};
  return {
    DeviceProfile: {
      DirectPlayProfiles: [],
      TranscodingProfiles: [{
        Container: container,
        Type: 'Video',
        VideoCodec: 'h264',
        AudioCodec: decodableAudio(isDesktop ? 'aac' : 'aac,mp3,ac3,eac3', request.device),
        Context: 'Streaming',
        Protocol: 'http',
        CopyTimestamps: true,
        MaxAudioChannels: '8',
      }],
      SubtitleProfiles: SUBTITLE_PROFILES,
      CodecProfiles: [],
      ...(transcode.maxBitrate ? { MaxStreamingBitrate: transcode.maxBitrate } : {}),
    },
    MediaSourceId: request.itemId,
    AllowVideoStreamCopy: false,
    AllowAudioStreamCopy: !isDesktop,
    ...(transcode.maxBitrate ? { MaxStreamingBitrate: transcode.maxBitrate } : {}),
    ...(transcode.audioStreamId !== undefined ? { AudioStreamIndex: Number(transcode.audioStreamId) } : {}),
  };
}

/** Asks Jellyfin for a progressive transcode; null when it offers none (the original is downloaded then). */
async function transcodedStream(client: JellyfinClient, request: DownloadRequest, durationMs: number | undefined) {
  const container = request.target === 'desktop' ? 'mp4' : 'ts';
  const response = await client.post<{ MediaSources?: MediaSourceInfo[] }>(
    `/Items/${request.itemId}/PlaybackInfo`, { userId: client.userId }, transcodeBody(request, container),
  );
  const source = response.MediaSources?.[0];
  if (!source?.TranscodingUrl) return null;
  let url = withoutQueryToken(new URL(`${client.serverUrl}${source.TranscodingUrl}`));
  const video = request.transcode?.video;
  if (video) url = withForcedVideoParams(url, video.bitrate, video.maxSize?.height ?? 0, video.maxSize?.width);
  const bitrate = video?.bitrate ?? source.Bitrate ?? 0;
  const seconds = (durationMs ?? 0) / 1000;
  return { url, container, estimatedSizeBytes: bitrate && seconds ? Math.ceil((bitrate / 8) * seconds) : undefined };
}

function sidecars(client: JellyfinClient, request: DownloadRequest, item: MediaItem): DownloadSidecar[] {
  const streamId = request.subtitleStreamId;
  if (streamId === undefined) return [];
  const format = request.target === 'desktop' ? 'vtt' : 'srt';
  const stream = ('versions' in item ? item.versions[0]?.subtitles : [])?.find((s) => s.id === streamId);
  return [{
    kind: 'subtitle',
    url: `${client.serverUrl}/Videos/${request.itemId}/${request.itemId}/Subtitles/${streamId}/Stream.${format}`,
    format,
    language: stream?.language ?? 'und',
    label: stream?.title ?? stream?.language ?? 'Unknown',
  }];
}

export async function planDownload(client: JellyfinClient, request: DownloadRequest, item: MediaItem): Promise<DownloadPlan> {
  const headers = { Authorization: client.authorization };
  const version = 'versions' in item ? item.versions[0] : undefined;
  const transcoded = request.transcode
    ? await transcodedStream(client, request, item.durationMs ?? version?.durationMs).catch(() => null)
    : null;
  const markers = await fetchMarkers(client, request.itemId).catch(() => []);
  return {
    url: transcoded?.url ?? `${client.serverUrl}/Items/${request.itemId}/Download`,
    headers,
    fileExtension: transcoded?.container ?? primaryContainer(version?.container) ?? FALLBACK_EXTENSION[item.kind] ?? 'bin',
    isTranscoded: !!transcoded,
    estimatedSizeBytes: transcoded?.estimatedSizeBytes,
    sidecars: sidecars(client, request, item),
    markers,
  };
}
