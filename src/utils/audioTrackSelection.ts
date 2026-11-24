import { CODEC_MIME, isAudioCodecSupported } from '@/domain';
import type { AudioStream, DeviceCapabilities } from '@/domain';
import { languageMatches } from '@/utils/language';

type Candidate = Pick<AudioStream, 'id' | 'codec' | 'profile' | 'language' | 'title' | 'isDefault' | 'channels'>;

// 2 = platform MediaCodec decoder, 1 = packaged FFmpeg only, 0 = needs a server transcode.
function decodeRank(stream: Candidate, device: DeviceCapabilities): number {
  if (!isAudioCodecSupported(stream.codec, stream.profile, device)) return 0;
  const mime = CODEC_MIME[stream.codec?.toLowerCase() || ''];
  return device.platformAudioCodecs.includes(mime) ? 2 : 1;
}

// E-AC3 JOC is only rendered as Atmos by a platform decoder that declares it.
function keepsAtmos(stream: Candidate, device: DeviceCapabilities): boolean {
  const profile = stream.profile?.toLowerCase() || '';
  return stream.codec?.toLowerCase() === 'eac3'
    && (profile.includes('atmos') || profile.includes('joc'))
    && device.platformAudioCodecs.includes('audio/eac3-joc');
}

function isCommentary(stream: Candidate): boolean {
  return /comment/i.test(stream.title || '');
}

function bestPlayableStream<T extends Candidate>(streams: T[], device: DeviceCapabilities): T {
  const mainTracks = streams.filter((stream) => !isCommentary(stream));
  const pool = mainTracks.length > 0 ? mainTracks : streams;
  const scoreOf = (stream: T) => [
    decodeRank(stream, device),
    keepsAtmos(stream, device) ? 1 : 0,
    stream.channels || 0,
    stream.isDefault ? 1 : 0,
  ];
  // Array.prototype.sort is stable, so equal scores keep file order.
  return [...pool].sort((a, b) => {
    const scoreA = scoreOf(a);
    const scoreB = scoreOf(b);
    const differing = scoreA.findIndex((value, i) => value !== scoreB[i]);
    return differing === -1 ? 0 : scoreB[differing] - scoreA[differing];
  })[0];
}

/**
 * Audio stream to request for playback. Language always wins: the first
 * preferred language with a matching track decides the candidate set, and only
 * among those tracks does the device's decoding ability break the tie (native
 * decoder, then FFmpeg, then server transcode; then Atmos, channels, default).
 * Commentary tracks are skipped unless they are the only match. Without device
 * capabilities the first language match is kept. With no language match the
 * default-flagged track, then the first track, is used.
 */
export function pickPreferredAudioStream<T extends Candidate>(
  streams: T[],
  preferredLanguages: Array<string | null | undefined>,
  device: DeviceCapabilities,
): T | undefined {
  for (const language of preferredLanguages) {
    if (!language) continue;
    const matches = streams.filter((stream) => languageMatches(language, stream.language || ''));
    if (matches.length === 0) continue;
    return device.isKnown ? bestPlayableStream(matches, device) : matches[0];
  }
  return streams.find((stream) => stream.isDefault) || streams[0];
}

/**
 * ExoPlayer audio group for a server audio stream. Both list a file's audio
 * tracks in container order, so the stream's position maps to the group's
 * position. Returns undefined rather than guessing when the lists differ.
 */
export function nativeAudioGroupFor(
  serverAudioStreams: Array<Pick<AudioStream, 'id'>>,
  nativeAudioGroups: Array<{ groupIndex: number }>,
  streamId: string | undefined,
): number | undefined {
  if (streamId === undefined || serverAudioStreams.length !== nativeAudioGroups.length) return undefined;
  const position = serverAudioStreams.findIndex((stream) => stream.id === streamId);
  return position >= 0 ? nativeAudioGroups[position].groupIndex : undefined;
}
