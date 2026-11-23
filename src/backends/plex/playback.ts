import { displayBoundsFor, isAudioCodecSupported, recommendedTranscodeBitrate, videoMime } from '@/domain';
import type {
  DeviceCapabilities,
  ExternalSubtitle,
  ItemId,
  PlaybackPlan,
  PlaybackPort,
  PlaybackProgress,
  PlaybackReporter,
  PlaybackRequest,
} from '@/domain';

import type { Params, PlexClient } from './client';
import { withParams } from './http';
import { toChapters, toMarkers, toMediaVersion } from './mappers';
import type { PlexMedia, PlexMetadata, PlexStream } from './types';

const UNIVERSAL = '/video/:/transcode/universal';
/** Plex accepts the transcode in these; ExoPlayer and hls.js play them. */
const DIRECT_CONTAINERS = ['mkv', 'mp4', 'mov', 'm4v', 'webm', 'avi', 'mpegts', 'ts'];
/** Codec names Plex uses, by the MIME types the device reports. */
const PLEX_CODEC_BY_MIME: Record<string, string> = {
  'video/avc': 'h264', 'video/hevc': 'hevc', 'video/x-vnd.on2.vp8': 'vp8', 'video/x-vnd.on2.vp9': 'vp9', 'video/av01': 'av1',
  'video/mp4v-es': 'mpeg4', 'video/mpeg2': 'mpeg2video',
  'audio/mp4a-latm': 'aac', 'audio/ac3': 'ac3', 'audio/eac3': 'eac3', 'audio/vnd.dts': 'dca', 'audio/true-hd': 'truehd',
  'audio/flac': 'flac', 'audio/opus': 'opus', 'audio/vorbis': 'vorbis', 'audio/mpeg': 'mp3', 'audio/mpeg-l2': 'mp2',
  'audio/alac': 'alac', 'audio/raw': 'pcm',
};
const WEB_VIDEO = ['h264'];
const WEB_AUDIO = ['aac', 'mp3'];
/** Sidecar formats the players read; the rest (PGS, VobSub, embedded tracks) is burned in. */
const SIDECAR_FORMAT: Record<string, ExternalSubtitle['format']> = { srt: 'srt', subrip: 'srt', vtt: 'vtt', webvtt: 'vtt', ass: 'ass', ssa: 'ass' };
/** Decision codes meaning "playable" (1000 direct play, 1001 conversion OK). */
const PLAYABLE = new Set([1000, 1001]);

interface Decision {
  generalDecisionCode?: number;
  generalDecisionText?: string;
  directPlayDecisionCode?: number;
  transcodeDecisionText?: string;
  Metadata?: { Media?: { Part?: { Stream?: DecisionStream[] }[] }[] }[];
}

/** A stream as the server will deliver it: 'copy', 'transcode' or 'burn'. */
type DecisionStream = Pick<PlexStream, 'id' | 'streamType' | 'codec'> & { decision?: string };

const unique = (values: string[]) => [...new Set(values)];
const plexCodecs = (mimes: string[]) => unique(mimes.map((mime) => PLEX_CODEC_BY_MIME[mime]).filter(Boolean));

function deviceCodecs(request: PlaybackRequest): { video: string[]; audio: string[] } {
  const device = request.device;
  if (request.target === 'web' || !device?.isKnown) return { video: WEB_VIDEO, audio: WEB_AUDIO };
  return {
    video: plexCodecs([...device.hardwareVideoCodecs, ...device.softwareVideoCodecs, ...device.ffmpegVideoCodecs]),
    audio: unique(['aac', ...plexCodecs([...device.platformAudioCodecs, ...device.ffmpegAudioCodecs])]),
  };
}

/**
 * `X-Plex-Client-Profile-Extra`: what Vela plays directly and what the
 * transcoder must output. Without it PMS uses its generic profile and refuses
 * most transcodes (decision 4005).
 */
export function clientProfileExtra(request: PlaybackRequest): string {
  const codecs = deviceCodecs(request);
  const excluded = request.constraints.excludeVideoCodecs;
  const targetVideo = request.target === 'web' ? WEB_VIDEO : ['h264', 'hevc'].filter((c) => codecs.video.includes(c) && !excluded.includes(c));
  const targetAudio = request.constraints.allowAudioCopy && request.target === 'native'
    ? codecs.audio.filter((c) => ['aac', 'ac3', 'eac3', 'mp3'].includes(c))
    : ['aac'];
  const container = request.target === 'web' ? 'mp4' : DIRECT_CONTAINERS.join(',');
  return [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=${(targetVideo.length ? targetVideo : ['h264']).join(',')}&audioCodec=${targetAudio.join(',')})`,
    `add-direct-play-profile(type=videoProfile&container=${container}&videoCodec=${codecs.video.join(',')}&audioCodec=${codecs.audio.join(',')})`,
  ].join('+');
}

const streamsOf = (media: PlexMedia, type: PlexStream['streamType']) => (media.Part?.[0]?.Stream ?? []).filter((s) => s.streamType === type);

/** The audio track the player will start on: the asked one, else the server's choice, else the first. */
function chosenAudio(media: PlexMedia, audioStreamId: string | undefined): PlexStream | undefined {
  const audio = streamsOf(media, 2);
  return audio.find((s) => String(s.id) === audioStreamId) ?? audio.find((s) => s.selected) ?? audio.find((s) => s.default) ?? audio[0];
}

/** Dolby Vision profile 5 has no HDR10 layer: without a DV decoder the colours are wrong. */
function decodesVideo(video: PlexStream | undefined, device: DeviceCapabilities): boolean {
  if (!video) return true;
  if (video.DOVIPresent && video.DOVIProfile === 5) return device.hardwareVideoCodecs.includes('video/dolby-vision');
  const mime = videoMime({ codec: video.codec, profile: video.profile });
  return !!mime && [device.hardwareVideoCodecs, device.softwareVideoCodecs, device.ffmpegVideoCodecs].some((list) => list.includes(mime));
}

/**
 * Vela decides direct play itself, as other Plex clients do: the server's
 * generic profile refuses files whose chosen audio track is not the first,
 * while ExoPlayer selects tracks inside the file (by language, after load).
 */
function playsDirectly(media: PlexMedia, request: PlaybackRequest): boolean {
  const container = (media.container ?? media.Part?.[0]?.container ?? '').toLowerCase();
  const video = streamsOf(media, 1)[0];
  const audio = chosenAudio(media, request.audioStreamId);
  const device = request.device;
  if (request.target === 'native' && device?.isKnown) {
    const audioOk = !audio || (request.constraints.allowAudioCopy && isAudioCodecSupported(audio.codec, audio.profile, device));
    return DIRECT_CONTAINERS.includes(container) && decodesVideo(video, device) && audioOk;
  }
  // Web preview, or a device that could not report its decoders: H.264 + AAC/MP3 only.
  const containers = request.target === 'web' ? ['mp4', 'm4v', 'mov'] : ['mp4', 'm4v', 'mov', 'mkv'];
  return containers.includes(container) && (!video || video.codec === 'h264') && (!audio || WEB_AUDIO.includes(audio.codec ?? ''));
}

export function pickMedia(item: PlexMetadata, versionId: string | undefined): { media: PlexMedia; index: number } {
  const all = item.Media ?? [];
  const index = Math.max(0, versionId ? all.findIndex((media) => String(media.id) === versionId) : 0);
  const media = all[index];
  if (!media?.Part?.[0]) throw new Error(`No playable file for ${item.ratingKey}`);
  return { media, index };
}

/** Transcode size: the user's cap, else the display when the source is larger. */
function videoResolution(media: PlexMedia, request: PlaybackRequest): string | undefined {
  if (request.maxSize) return `${request.maxSize.width}x${request.maxSize.height}`;
  const video = media.Part?.[0]?.Stream?.find((stream) => stream.streamType === 1);
  const bounds = video && request.device ? displayBoundsFor({ width: video.width, height: video.height }, request.device) : null;
  return bounds ? `${bounds.width}x${bounds.height}` : undefined;
}

function maxVideoBitrateKbps(request: PlaybackRequest, mustTranscode: boolean): number | undefined {
  if (request.maxBitrate) return Math.round(request.maxBitrate / 1000);
  if (mustTranscode && request.device?.isKnown) return Math.round(recommendedTranscodeBitrate(request.device) / 1000);
  return undefined;
}

/** Subtitle files beside the video; the web player reads SRT and WebVTT only (ASS is burned in there). */
function externalSubtitles(client: PlexClient, media: PlexMedia, target: PlaybackRequest['target']): ExternalSubtitle[] {
  return (media.Part?.[0]?.Stream ?? []).flatMap((stream) => {
    const format = SIDECAR_FORMAT[stream.codec?.toLowerCase() ?? ''];
    const isPlayable = format && (target === 'native' || format !== 'ass');
    return stream.streamType === 3 && stream.key && isPlayable ? [{ streamId: String(stream.id), url: client.url(stream.key), format }] : [];
  });
}

function newSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPlexPlayback(client: PlexClient): PlaybackPort {
  const metadata = async (id: ItemId) => {
    const [item] = await client.metadata(`/library/metadata/${id}`, { includeMarkers: 1, includeChapters: 1 });
    if (!item) throw new Error(`Item not found: ${id}`);
    return item;
  };

  function directPlan(media: PlexMedia, request: PlaybackRequest): PlaybackPlan {
    const url = `${client.baseUrl}${media.Part![0].key}`;
    return {
      method: 'direct-play',
      url,
      headers: { ...client.headers },
      mediaElementUrl: withParams(url, { 'X-Plex-Token': client.token }),
      version: toMediaVersion(media),
      startOffsetMs: 0,
      externalSubtitles: externalSubtitles(client, media, request.target),
      sessionId: '',
      transcodeReasons: [],
    };
  }

  async function streamPlan(request: PlaybackRequest, media: PlexMedia, mediaIndex: number): Promise<PlaybackPlan> {
    const isBurnIn = request.subtitle?.mode === 'burn-in';
    const isForced = !request.constraints.allowDirectPlay || isBurnIn;
    const sessionId = newSessionId();
    const params: Params = {
      path: `/library/metadata/${request.itemId}`,
      mediaIndex,
      partIndex: 0,
      protocol: 'hls',
      fastSeek: 1,
      directPlay: 0,
      directStream: isForced ? 0 : 1,
      directStreamAudio: request.constraints.allowAudioCopy ? 1 : 0,
      videoQuality: 100,
      maxVideoBitrate: maxVideoBitrateKbps(request, isForced),
      // An automatic transcode keeps the source size; a forced one fits the display.
      videoResolution: request.maxSize || isForced ? videoResolution(media, request) : undefined,
      offset: request.startMs ? Math.floor(request.startMs / 1000) : undefined,
      audioStreamID: request.audioStreamId,
      subtitleStreamID: isBurnIn ? request.subtitle?.streamId : undefined,
      subtitles: isBurnIn ? 'burn' : 'none',
      session: sessionId,
      'X-Plex-Session-Identifier': sessionId,
      'X-Plex-Client-Profile-Name': 'Generic',
      'X-Plex-Client-Profile-Extra': clientProfileExtra(request),
    };
    const decision = (await client.get<{ MediaContainer: Decision }>(`${UNIVERSAL}/decision`, params)).MediaContainer;
    const code = Number(decision.generalDecisionCode);
    if (!PLAYABLE.has(code)) throw new Error(`Plex cannot play this item (${code}: ${decision.generalDecisionText ?? ''})`);
    const streams = decision.Metadata?.[0]?.Media?.[0]?.Part?.[0]?.Stream ?? [];
    const isVideoCopy = streams.find((stream) => stream.streamType === 1)?.decision === 'copy';
    const url = `${client.baseUrl}${withParams(`${UNIVERSAL}/start.m3u8`, params)}`;
    return {
      method: isVideoCopy ? 'direct-stream' : 'transcode',
      url,
      headers: { ...client.headers },
      mediaElementUrl: withParams(url, { 'X-Plex-Token': client.token }),
      version: toMediaVersion(media),
      // The HLS stream starts at the (whole-second) offset.
      startOffsetMs: Math.floor((request.startMs ?? 0) / 1000) * 1000,
      externalSubtitles: externalSubtitles(client, media, request.target),
      sessionId,
      transcodeReasons: decision.transcodeDecisionText ? [decision.transcodeDecisionText] : [],
    };
  }

  async function negotiate(request: PlaybackRequest): Promise<PlaybackPlan> {
    const item = await metadata(request.itemId);
    const { media, index } = pickMedia(item, request.versionId);
    const mayDirectPlay = request.constraints.allowDirectPlay && request.subtitle?.mode !== 'burn-in'
      && !request.maxBitrate && !request.maxSize && !request.preferStream;
    return mayDirectPlay && playsDirectly(media, request) ? directPlan(media, request) : streamPlan(request, media, index);
  }

  function reporter(plan: PlaybackPlan, itemId: ItemId): PlaybackReporter {
    let isReleased = false;
    const timeline = (state: 'playing' | 'paused' | 'stopped', progress: PlaybackProgress) => client.send('GET', '/:/timeline', {
      ratingKey: itemId,
      key: `/library/metadata/${itemId}`,
      state,
      time: Math.round(progress.positionMs),
      duration: progress.durationMs === undefined ? undefined : Math.round(progress.durationMs),
      'X-Plex-Session-Identifier': plan.sessionId || undefined,
    });
    async function release() {
      if (isReleased || !plan.sessionId) return;
      isReleased = true;
      await client.send('GET', `${UNIVERSAL}/stop`, { session: plan.sessionId }).catch(() => undefined);
    }
    return {
      start: (progress) => timeline(progress.isPaused ? 'paused' : 'playing', progress),
      progress: (progress) => timeline(progress.isPaused ? 'paused' : 'playing', progress),
      stop: async (progress) => {
        await timeline('stopped', progress);
        await release();
      },
      release,
    };
  }

  return {
    negotiate,
    reporter,
    markers: async (id) => toMarkers((await metadata(id)).Marker),
    chapters: async (id) => toChapters((await metadata(id)).Chapter),
    // BIF previews exist only when PMS generated them ("video preview thumbnails").
    trickplay: async (id, versionId) => {
      const { media } = pickMedia(await metadata(id), versionId);
      const part = media.Part?.[0];
      if (!part?.indexes) return null;
      return { format: 'bif', url: `${client.baseUrl}/library/parts/${part.id}/indexes/${part.indexes}`, headers: { ...client.headers } };
    },
  };
}
