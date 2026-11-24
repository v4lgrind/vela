import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { MediaSegmentDto } from '@jellyfin/sdk/lib/generated-client/models/media-segment-dto';

import type { Chapter, Marker, PlaybackPlan, PlaybackProgress, PlaybackReporter, StreamInfo, Trickplay } from '@/domain';

import type { JellyfinClient } from '../client';
import { msToTicks, toChapters, toMarkers, ticksToMs } from '../mappers';

const PLAY_METHOD = { 'direct-play': 'DirectPlay', 'direct-stream': 'DirectStream', transcode: 'Transcode' } as const;
const RELEASE_TIMEOUT_MS = 5000;
/** Seek previews are ~200dp wide: the smallest sheet that stays sharp is enough. */
const MIN_TRICKPLAY_WIDTH = 300;

/** Sessions/Playing reporting and transcode release for one playback. */
export function createReporter(client: JellyfinClient, plan: PlaybackPlan, itemId: string): PlaybackReporter {
  const payload = (progress: PlaybackProgress) => ({
    ItemId: itemId,
    SessionId: plan.sessionId,
    MediaSourceId: plan.version.id || itemId,
    PositionTicks: msToTicks(progress.positionMs),
    AudioStreamIndex: progress.audioStreamId === undefined ? undefined : Number(progress.audioStreamId),
    PlayMethod: PLAY_METHOD[plan.method],
    PlaySessionId: plan.sessionId,
    IsPaused: progress.isPaused,
    IsMuted: progress.isMuted ?? false,
    VolumeLevel: progress.volume ?? 100,
  });
  const post = (path: string, body: object) => client.send('POST', `/Sessions/Playing${path}`, {}, body);

  async function release() {
    if (!plan.sessionId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RELEASE_TIMEOUT_MS);
    try {
      await client.send('DELETE', '/Videos/ActiveEncodings', {
        deviceId: client.connection.deviceId, playSessionId: plan.sessionId,
      }, undefined, { signal: controller.signal, keepalive: true });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    start: (progress) => post('', { ...payload(progress), CanSeek: true }),
    progress: (progress) => post('/Progress', payload(progress)),
    stop: (progress) => client.send('POST', '/Sessions/Playing/Stopped', {}, payload(progress), { keepalive: true }),
    release,
  };
}

export async function fetchMarkers(client: JellyfinClient, itemId: string): Promise<Marker[]> {
  const page = await client.get<{ Items?: MediaSegmentDto[] }>(`/MediaSegments/${itemId}`, {
    includeSegmentTypes: ['Intro', 'Outro'],
  });
  return toMarkers(page.Items ?? []);
}

async function detail(client: JellyfinClient, itemId: string, field: string): Promise<BaseItemDto | undefined> {
  const page = await client.get<{ Items?: BaseItemDto[] }>('/Items', { userId: client.userId, ids: [itemId], fields: [field] });
  return page.Items?.[0];
}

export async function fetchChapters(client: JellyfinClient, itemId: string): Promise<Chapter[]> {
  const item = await detail(client, itemId, 'Chapters');
  return toChapters(item?.Chapters ?? [], ticksToMs(item?.RunTimeTicks));
}

interface TrickplayInfo { Width: number; Height: number; TileWidth: number; TileHeight: number; ThumbnailCount: number; Interval: number }

export async function fetchTrickplay(client: JellyfinClient, itemId: string, versionId: string): Promise<Trickplay | null> {
  const item = await detail(client, itemId, 'Trickplay');
  const byVersion = item?.Trickplay as Record<string, Record<string, TrickplayInfo>> | null | undefined;
  if (!byVersion) return null;
  const resolutions = Object.values(byVersion[versionId] ?? Object.values(byVersion)[0] ?? {}).sort((a, b) => a.Width - b.Width);
  const info = resolutions.find((r) => r.Width >= MIN_TRICKPLAY_WIDTH) ?? resolutions[resolutions.length - 1];
  if (!info) return null;
  return {
    format: 'tiles',
    urlTemplate: `${client.serverUrl}/Videos/${itemId}/Trickplay/${info.Width}/{index}.jpg?MediaSourceId=${versionId}`,
    headers: { Authorization: client.authorization },
    thumbnailWidth: info.Width,
    thumbnailHeight: info.Height,
    columns: info.TileWidth,
    rows: info.TileHeight,
    thumbnailCount: info.ThumbnailCount,
    intervalMs: info.Interval,
  };
}

interface TranscodingInfo {
  VideoCodec?: string; AudioCodec?: string; Container?: string; Width?: number; Height?: number; Framerate?: number;
  Bitrate?: number; IsVideoDirect?: boolean; IsAudioDirect?: boolean; TranscodeReasons?: string[];
}
interface SessionInfo { DeviceId?: string; PlayState?: { PlaySessionId?: string }; TranscodingInfo?: TranscodingInfo }

/** Live transcode details of this playback, from the server's active sessions. */
export async function fetchStreamInfo(client: JellyfinClient, plan: PlaybackPlan): Promise<StreamInfo | null> {
  const sessions = await client.get<SessionInfo[]>('/Sessions', { activeWithinSeconds: 10 });
  const session = sessions.find((s) => s.DeviceId === client.connection.deviceId)
    ?? sessions.find((s) => s.PlayState?.PlaySessionId === plan.sessionId);
  const info = session?.TranscodingInfo;
  if (!info) return null;
  return {
    videoCodec: info.VideoCodec, audioCodec: info.AudioCodec, container: info.Container,
    width: info.Width, height: info.Height, frameRate: info.Framerate, bitrate: info.Bitrate,
    isVideoDirect: !!info.IsVideoDirect, isAudioDirect: !!info.IsAudioDirect, transcodeReasons: info.TranscodeReasons ?? [],
  };
}
