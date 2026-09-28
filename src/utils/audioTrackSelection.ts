import { CODEC_MIME_MAP, isAudioStreamSupported } from '@/utils/codecDetection';
import { languageMatches } from '@/utils/language';

import type { NativeDeviceCapabilities } from '@/plugins/NativeVideoPlugin';
import type { MediaStream } from '@/types/jellyfin';

type AudioStream = Pick<
  MediaStream,
  'Index' | 'Codec' | 'Profile' | 'Language' | 'DisplayTitle' | 'IsDefault' | 'Channels'
>;

// 2 = platform MediaCodec decoder, 1 = packaged FFmpeg only, 0 = needs a server transcode.
function decodeRank(stream: AudioStream, capabilities: NativeDeviceCapabilities): number {
  if (!isAudioStreamSupported(stream, capabilities)) return 0;
  const mime = CODEC_MIME_MAP[stream.Codec?.toLowerCase() || ''];
  return capabilities.platformAudioCodecs.includes(mime) ? 2 : 1;
}

// E-AC3 JOC is only rendered as Atmos by a platform decoder that declares it.
function keepsAtmos(stream: AudioStream, capabilities: NativeDeviceCapabilities): boolean {
  const profile = stream.Profile?.toLowerCase() || '';
  return stream.Codec?.toLowerCase() === 'eac3'
    && (profile.includes('atmos') || profile.includes('joc'))
    && capabilities.platformAudioCodecs.includes('audio/eac3-joc');
}

function isCommentary(stream: AudioStream): boolean {
  return /comment/i.test(stream.DisplayTitle || '');
}

function bestPlayableStream<T extends AudioStream>(streams: T[], capabilities: NativeDeviceCapabilities): T {
  const mainTracks = streams.filter(stream => !isCommentary(stream));
  const pool = mainTracks.length > 0 ? mainTracks : streams;
  const scoreOf = (stream: T) => [
    decodeRank(stream, capabilities),
    keepsAtmos(stream, capabilities) ? 1 : 0,
    stream.Channels || 0,
    stream.IsDefault ? 1 : 0,
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
export function pickPreferredAudioStream<T extends AudioStream>(
  streams: T[],
  preferredLanguages: Array<string | null | undefined>,
  capabilities: NativeDeviceCapabilities,
): T | undefined {
  for (const language of preferredLanguages) {
    if (!language) continue;
    const matches = streams.filter(stream => languageMatches(language, stream.Language || ''));
    if (matches.length === 0) continue;
    return capabilities.androidApi > 0 ? bestPlayableStream(matches, capabilities) : matches[0];
  }
  return streams.find(stream => stream.IsDefault) || streams[0];
}

/**
 * ExoPlayer audio group for a Jellyfin audio stream. Both list a file's audio
 * tracks in container order, so the stream's position maps to the group's
 * position. Returns undefined rather than guessing when the lists differ.
 */
export function nativeAudioGroupFor(
  jellyfinAudioStreams: Array<Pick<MediaStream, 'Index'>>,
  nativeAudioGroups: Array<{ groupIndex: number }>,
  jellyfinIndex: number | undefined,
): number | undefined {
  if (jellyfinIndex === undefined || jellyfinAudioStreams.length !== nativeAudioGroups.length) {
    return undefined;
  }
  const position = jellyfinAudioStreams.findIndex(stream => stream.Index === jellyfinIndex);
  return position >= 0 ? nativeAudioGroups[position].groupIndex : undefined;
}
