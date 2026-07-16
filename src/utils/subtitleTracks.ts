import type { MediaStream, SubtitleTrack } from '@/types/jellyfin';

interface CreateSubtitleTracksOptions {
  streams: MediaStream[];
  serverUrl: string;
  itemId: string;
  mediaSourceId: string;
}

function isExternallyPlayableText(stream: MediaStream): boolean {
  return stream.IsTextSubtitleStream === true
    && Boolean(stream.DeliveryUrl || stream.SupportsExternalStream);
}

/**
 * A subtitle stream is delivered as a server-side burn-in whenever it cannot be
 * played as an external text sidecar. This mirrors the `playbackMode` assigned
 * in `createSubtitleTracks`, so callers restoring a saved burn-in choice must
 * use this predicate rather than a narrower one (e.g. `!IsTextSubtitleStream`),
 * which would miss text subtitles that lack external delivery.
 */
export function isBurnInSubtitleStream(stream: MediaStream): boolean {
  return stream.Type === 'Subtitle' && !isExternallyPlayableText(stream);
}

function buildSubtitleLabel(stream: MediaStream): string {
  if (stream.DisplayTitle) return stream.DisplayTitle;
  const forcedSuffix = stream.IsForced ? ' (Forced)' : '';
  return `${(stream.Language || 'und').toUpperCase()}${forcedSuffix}`;
}

function buildDeliveryUrl(
  stream: MediaStream,
  serverUrl: string,
  itemId: string,
  mediaSourceId: string,
): string | undefined {
  if (!isExternallyPlayableText(stream)) return undefined;
  if (stream.DeliveryUrl) return `${serverUrl}${stream.DeliveryUrl}`;
  return `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${stream.Index}/0/Stream.vtt`;
}

export function createSubtitleTracks(options: CreateSubtitleTracksOptions): SubtitleTrack[] {
  const { streams, serverUrl, itemId, mediaSourceId } = options;

  return streams
    .filter((stream) => stream.Type === 'Subtitle')
    .map((stream) => ({
      index: stream.Index,
      language: stream.Language || 'und',
      label: buildSubtitleLabel(stream),
      playbackMode: isExternallyPlayableText(stream) ? 'external' : 'burn-in',
      deliveryUrl: buildDeliveryUrl(stream, serverUrl, itemId, mediaSourceId),
    }));
}

export function parseSavedBurnInSubtitleIndex(value: string | null): number | null {
  if (!value?.startsWith('burn-in:')) return null;
  const streamIndex = Number.parseInt(value.slice('burn-in:'.length), 10);
  return Number.isNaN(streamIndex) ? null : streamIndex;
}
