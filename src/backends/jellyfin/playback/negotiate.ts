import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

import { displayBoundsFor, recommendedTranscodeBitrate } from '@/domain';
import type { DeviceCapabilities, PlayMethod, PlaybackPlan, PlaybackRequest } from '@/domain';

import type { JellyfinClient } from '../client';
import { msToTicks, toMediaVersion } from '../mappers';

import { deviceProfile, nativeAndroidDeviceProfile, withAacTranscodeAudio, withDeviceAudioCodecs } from './profiles';
import { buildPlaybackUrl, withMaxVideoSize } from './urls';

/** Caps used when a native request arrives without capabilities (they could not be read). */
const UNKNOWN_DEVICE: DeviceCapabilities = {
  hardwareVideoCodecs: [], softwareVideoCodecs: [], platformAudioCodecs: [], ffmpegAudioCodecs: [], ffmpegVideoCodecs: [],
  displayWidth: 0, displayHeight: 0, isKnown: false,
};
const NO_CAP = 1_000_000_000;
const METHOD: Record<string, PlayMethod> = { DirectPlay: 'direct-play', DirectStream: 'direct-stream', Transcode: 'transcode' };

interface PlaybackInfoResponse {
  PlaySessionId?: string;
  MediaSources?: MediaSourceInfo[];
}

/** The request in the terms of the pre-port negotiation (pinned by the golden files). */
function legacyTerms(request: PlaybackRequest) {
  const isNative = request.target === 'native';
  return {
    isNative,
    startTimeTicks: request.startMs === undefined ? undefined : msToTicks(request.startMs),
    audioStreamIndex: request.audioStreamId === undefined ? undefined : Number(request.audioStreamId),
    subtitleStreamIndex: request.subtitle?.mode === 'burn-in' ? Number(request.subtitle.streamId) : undefined,
    forceTranscode: !request.constraints.allowDirectPlay,
    transcodeAudio: !request.constraints.allowAudioCopy,
    stripHevc: request.constraints.excludeVideoCodecs.includes('hevc'),
    selectedBitrate: request.maxBitrate ?? 0,
    device: isNative ? request.device ?? UNKNOWN_DEVICE : null,
  };
}

type Terms = ReturnType<typeof legacyTerms>;

const removeHevc = (csv: string) => csv.split(',').filter((c) => c !== 'hevc' && c !== 'h265').join(',');

/**
 * The DeviceProfile edits that express the player's fallbacks:
 * - stripHevc (video decode failure): no HEVC transcode target;
 * - transcodeAudio (audio decode failure): AAC-only audio target;
 * - forced transcode / quality cap / burn-in: no DirectPlay profiles, capped bitrate.
 */
function deviceProfileFor(terms: Terms, bitrateCap: number, shouldForce: boolean) {
  const base = terms.device
    ? { ...nativeAndroidDeviceProfile, DeviceProfile: withDeviceAudioCodecs(nativeAndroidDeviceProfile.DeviceProfile, terms.device) }
    : deviceProfile;
  const patched = terms.stripHevc
    ? {
      ...base.DeviceProfile,
      TranscodingProfiles: (base.DeviceProfile.TranscodingProfiles || []).map((tp) =>
        ('VideoCodec' in tp && tp.VideoCodec ? { ...tp, VideoCodec: removeHevc(tp.VideoCodec) } : tp)),
    }
    : base.DeviceProfile;
  const transcodeProfile = terms.transcodeAudio ? withAacTranscodeAudio(patched) : patched;
  const stripDirectPlay = shouldForce || terms.transcodeAudio;
  return {
    base,
    profile: stripDirectPlay ? { ...transcodeProfile, DirectPlayProfiles: [], MaxStreamingBitrate: bitrateCap } : patched,
  };
}

function requestFor(terms: Terms, itemId: string) {
  const shouldBurnSubtitle = terms.subtitleStreamIndex !== undefined;
  const needsNativeVideoTranscode = terms.isNative && terms.selectedBitrate === 0 && (terms.forceTranscode || shouldBurnSubtitle);
  const bitrateCap = terms.selectedBitrate
    || (needsNativeVideoTranscode && terms.device ? recommendedTranscodeBitrate(terms.device) : NO_CAP);
  // A quality cap must force a real re-encode: without AllowVideoStreamCopy=false
  // Jellyfin can fall back to DirectStream (remux), which ignores the cap.
  const shouldForce = terms.forceTranscode || terms.selectedBitrate > 0 || shouldBurnSubtitle;
  const { base, profile } = deviceProfileFor(terms, bitrateCap, shouldForce);
  // Jellyfin drops StartTimeTicks from the TranscodingUrl when AllowVideoStreamCopy=false;
  // with a resume point, rely on the stripped profiles + bitrate cap instead.
  const blockVideoCopy = shouldBurnSubtitle || (shouldForce && !terms.startTimeTicks);
  const body = {
    ...base,
    MaxStreamingBitrate: bitrateCap,
    ...(blockVideoCopy ? { AllowVideoStreamCopy: false } : {}),
    ...(terms.transcodeAudio ? { AllowAudioStreamCopy: false } : {}),
    ...(shouldBurnSubtitle ? { AllowSubtitleStreamCopy: false, AlwaysBurnInSubtitleWhenTranscoding: true } : {}),
    DeviceProfile: profile,
    MediaSourceId: itemId,
    ...(terms.startTimeTicks !== undefined ? { StartTimeTicks: terms.startTimeTicks } : {}),
    ...(terms.audioStreamIndex !== undefined ? { AudioStreamIndex: terms.audioStreamIndex } : {}),
    ...(terms.subtitleStreamIndex !== undefined ? { SubtitleStreamIndex: terms.subtitleStreamIndex } : {}),
  };
  // StartTimeTicks goes in the query too: some versions ignore it in the body.
  const query = {
    StartTimeTicks: terms.startTimeTicks,
    SubtitleStreamIndex: terms.subtitleStreamIndex,
  };
  return { body, query, limitToDisplay: needsNativeVideoTranscode };
}

/** An automatic native transcode keeps the source resolution unless told otherwise. */
function limitToDisplay(source: MediaSourceInfo, device: DeviceCapabilities) {
  const video = source.MediaStreams?.find((stream) => stream.Type === 'Video');
  const bounds = video ? displayBoundsFor({ width: video.Width ?? undefined, height: video.Height ?? undefined }, device) : null;
  if (!bounds || !source.TranscodingUrl) return;
  source.TranscodingUrl = withMaxVideoSize(source.TranscodingUrl, bounds.width, bounds.height);
}

function transcodeReasons(url: string | null | undefined): string[] {
  const reasons = url ? new URL(url, 'http://relative.invalid').searchParams.get('TranscodeReasons') : null;
  return reasons ? reasons.split(',') : [];
}

export async function negotiate(client: JellyfinClient, request: PlaybackRequest): Promise<PlaybackPlan> {
  const terms = legacyTerms(request);
  const { body, query, limitToDisplay: shouldLimit } = requestFor(terms, request.itemId);
  const response = await client.post<PlaybackInfoResponse>(`/Items/${request.itemId}/PlaybackInfo`, { userId: client.userId, ...query }, body);
  const source = response.MediaSources?.[0];
  if (!source) throw new Error(`No playable source for ${request.itemId}`);
  if (shouldLimit && terms.device) limitToDisplay(source, terms.device);

  const sessionId = response.PlaySessionId ?? '';
  const { method, url } = buildPlaybackUrl({
    Id: source.Id ?? undefined,
    SupportsDirectPlay: source.SupportsDirectPlay,
    SupportsDirectStream: source.SupportsDirectStream,
    TranscodingUrl: source.TranscodingUrl ?? undefined,
  }, {
    serverUrl: client.serverUrl, itemId: request.itemId, accessToken: client.token, isNative: terms.isNative, playSessionId: sessionId,
  });
  const isDirectFile = method === 'DirectPlay' && !url.includes('.m3u8');
  const startsAtResume = !isDirectFile && url.includes('StartTimeTicks');
  return {
    method: METHOD[method],
    url,
    headers: { Authorization: client.authorization },
    version: toMediaVersion(source, request.itemId),
    startOffsetMs: startsAtResume ? Math.floor(request.startMs ?? 0) : 0,
    externalSubtitles: [],
    sessionId,
    transcodeReasons: transcodeReasons(source.TranscodingUrl),
  };
}
