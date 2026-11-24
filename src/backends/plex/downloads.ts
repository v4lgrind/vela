import type { DownloadPlan, DownloadRequest, DownloadSidecar } from '@/domain';

import type { PlexClient } from './client';
import { toMarkers } from './mappers';
import { pickMedia } from './playback';
import type { PlexMedia, PlexMetadata } from './types';

const UNIVERSAL = '/video/:/transcode/universal';
/** Decision codes meaning "playable": 1000 direct play, 1001 conversion OK. */
const PLAYABLE = new Set([1000, 1001]);
const SIDECAR_FORMAT: Record<string, DownloadSidecar['format']> = { srt: 'srt', subrip: 'srt', vtt: 'vtt', webvtt: 'vtt' };
/** Audio bitrate assumed in the size estimate of a converted download. */
const AUDIO_BPS = 192_000;
/**
 * Converted downloads come as Matroska: PMS refuses the `static` (sync)
 * context and streams an empty progressive MP4; MKV arrives as it is encoded.
 */
const CONVERTED_CONTAINER = 'mkv';

function sidecarFor(client: PlexClient, media: PlexMedia, streamId: string | undefined): DownloadSidecar[] {
  const stream = (media.Part?.[0]?.Stream ?? []).find((s) => String(s.id) === streamId && s.streamType === 3 && s.key);
  const format = SIDECAR_FORMAT[stream?.codec?.toLowerCase() ?? ''];
  if (!stream?.key || !format) return [];
  return [{ kind: 'subtitle', url: client.url(stream.key), format, language: stream.languageCode, label: stream.displayTitle ?? stream.title }];
}

async function convertedUrl(client: PlexClient, request: DownloadRequest, item: PlexMetadata, mediaIndex: number): Promise<string | null> {
  const transcode = request.transcode!;
  const bitrate = transcode.video?.bitrate ?? transcode.maxBitrate;
  const size = transcode.video?.maxSize;
  const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const params = {
    path: `/library/metadata/${item.ratingKey}`,
    mediaIndex,
    partIndex: 0,
    protocol: 'http',
    directPlay: 0,
    directStream: 0,
    directStreamAudio: 1,
    videoQuality: 100,
    maxVideoBitrate: bitrate ? Math.round(bitrate / 1000) : undefined,
    videoResolution: size ? `${size.width}x${size.height}` : undefined,
    audioStreamID: transcode.audioStreamId,
    subtitles: 'none',
    session,
    'X-Plex-Session-Identifier': session,
    'X-Plex-Client-Profile-Name': 'Generic',
    'X-Plex-Client-Profile-Extra':
      `add-transcode-target(type=videoProfile&context=streaming&protocol=http&container=${CONVERTED_CONTAINER}&videoCodec=h264&audioCodec=aac,ac3,eac3,mp3)`,
  };
  try {
    const decision = await client.get<{ MediaContainer?: { generalDecisionCode?: number } }>(`${UNIVERSAL}/decision`, params);
    if (!PLAYABLE.has(Number(decision.MediaContainer?.generalDecisionCode))) return null;
  } catch {
    return null;
  }
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])));
  return `${client.baseUrl}${UNIVERSAL}/start.${CONVERTED_CONTAINER}?${query}`;
}

/** Original file (`?download=1`), or a Matroska conversion when a quality is asked and PMS accepts it. */
export async function planPlexDownload(client: PlexClient, request: DownloadRequest): Promise<DownloadPlan> {
  const [item] = await client.metadata(`/library/metadata/${request.itemId}`, { includeMarkers: 1, includeChapters: 1 });
  if (!item) throw new Error(`Item not found: ${request.itemId}`);
  const { media, index } = pickMedia(item, request.versionId);
  const part = media.Part![0];
  const common = { headers: { ...client.headers }, sidecars: sidecarFor(client, media, request.subtitleStreamId), markers: toMarkers(item.Marker) };

  const converted = request.transcode ? await convertedUrl(client, request, item, index) : null;
  if (converted) {
    const videoBps = request.transcode?.video?.bitrate ?? request.transcode?.maxBitrate ?? 0;
    const durationMs = media.duration ?? item.duration ?? 0;
    return {
      ...common,
      url: converted,
      fileExtension: CONVERTED_CONTAINER,
      isTranscoded: true,
      estimatedSizeBytes: Math.round(((videoBps + AUDIO_BPS) * durationMs) / 8000) || undefined,
    };
  }
  return {
    ...common,
    url: `${client.baseUrl}${part.key}?download=1`,
    fileExtension: part.container ?? media.container ?? 'mkv',
    isTranscoded: false,
    estimatedSizeBytes: part.size,
  };
}
