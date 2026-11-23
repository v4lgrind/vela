import type { ExternalSubtitle, MediaVersion, SubtitleStream } from '@/domain';
import type { SubtitleTrack } from '@/types/player';

/**
 * Before the server is asked, image subtitles (PGS, VobSub) are the ones that
 * can only be burned in. After negotiation the plan's sidecar list is
 * authoritative (`createSubtitleTracks`).
 */
export function isBurnInSubtitleStream(stream: Pick<SubtitleStream, 'format'>): boolean {
  return stream.format === 'image';
}

function subtitleLabel(stream: SubtitleStream): string {
  if (stream.title) return stream.title;
  const forcedSuffix = stream.isForced ? ' (Forced)' : '';
  return `${(stream.language || 'und').toUpperCase()}${forcedSuffix}`;
}

/** Player subtitle choices: sidecars the server serves, burn-in for the rest. */
export function createSubtitleTracks(version: MediaVersion, external: ExternalSubtitle[]): SubtitleTrack[] {
  const sidecarById = new Map(external.map((sidecar) => [sidecar.streamId, sidecar]));
  return version.subtitles.map((stream) => {
    const sidecar = sidecarById.get(stream.id);
    return {
      index: Number(stream.id),
      language: stream.language || 'und',
      label: subtitleLabel(stream),
      playbackMode: sidecar ? 'external' : 'burn-in',
      deliveryUrl: sidecar?.url,
      deliveryFormat: sidecar?.format,
      isExternalFile: stream.isExternal,
      format: stream.format,
    };
  });
}

export function parseSavedBurnInSubtitleIndex(value: string | null): number | null {
  if (!value?.startsWith('burn-in:')) return null;
  const streamIndex = Number.parseInt(value.slice('burn-in:'.length), 10);
  return Number.isNaN(streamIndex) ? null : streamIndex;
}
