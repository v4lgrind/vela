import type { MediaBackend, MediaItem } from '@/domain';

const TICKS_PER_MS = 10_000;
const HLS = 'application/x-mpegURL';

export type CastRequest =
  /** Jellyfin's own receiver app fetches the item itself. */
  | { kind: 'receiver'; itemId: string; serverUrl: string; accessToken: string; startPositionTicks: number; title: string }
  /** Default Media Receiver: a stream URL that carries its own credentials. */
  | { kind: 'url'; url: string; contentType: string; title: string; imageUrl?: string; startPositionMs: number };

/**
 * What to send to the Cast device for `item`. For servers without a receiver app
 * (Plex), a browser-profile stream (H.264/AAC, HLS or MP4) is negotiated: the
 * Default Media Receiver plays those, and the URL carries the token.
 */
export async function castRequestFor(
  backend: MediaBackend,
  item: MediaItem,
  account: { serverUrl: string; token: string },
): Promise<CastRequest> {
  const resumeMs = item.user.resumePositionMs ?? 0;
  if (backend.castMode === 'jellyfin-receiver') {
    return {
      kind: 'receiver', itemId: item.id, serverUrl: account.serverUrl, accessToken: account.token,
      startPositionTicks: resumeMs * TICKS_PER_MS, title: item.title,
    };
  }
  const plan = await backend.playback.negotiate({
    itemId: item.id,
    target: 'web',
    startMs: resumeMs || undefined,
    constraints: { allowDirectPlay: true, allowAudioCopy: true, excludeVideoCodecs: [] },
  });
  const isHls = plan.url.includes('.m3u8');
  return {
    kind: 'url',
    url: plan.mediaElementUrl,
    contentType: isHls ? HLS : 'video/mp4',
    title: item.title,
    imageUrl: item.images.poster ? backend.imageUrl(item.images.poster) : undefined,
    // An HLS conversion already starts at the resume point.
    startPositionMs: Math.max(0, resumeMs - plan.startOffsetMs),
  };
}
