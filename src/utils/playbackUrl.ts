export type PlaybackMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

export interface PlaybackMediaSource {
  Id?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  TranscodingUrl?: string;
}

export interface PlaybackUrlContext {
  serverUrl: string;
  itemId: string;
  accessToken: string;
  /** Native (ExoPlayer) passes the token via an auth header; web plays via
   *  <video>.src and must carry the token in the URL. */
  isNative: boolean;
  playSessionId: string;
}

/**
 * Pure URL/method resolver extracted from PlayerPage's determinePlaybackMethod
 * so the web-vs-native auth behaviour can be unit-tested without a component.
 */
export function buildPlaybackUrl(
  ms: PlaybackMediaSource,
  ctx: PlaybackUrlContext,
): { method: PlaybackMethod; url: string } {
  const { serverUrl, itemId, accessToken, isNative, playSessionId } = ctx;

  if (ms.SupportsDirectPlay) {
    const msId = ms.Id || itemId;
    const auth = isNative ? '' : `&api_key=${accessToken}`;
    return {
      method: 'DirectPlay',
      url: `${serverUrl}/Videos/${itemId}/stream?static=true&mediaSourceId=${msId}${auth}`,
    };
  }

  const method: PlaybackMethod = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
  if (ms.TranscodingUrl) {
    return { method, url: `${serverUrl}${ms.TranscodingUrl}`.replace('?&', '?') };
  }
  return {
    method,
    url: `${serverUrl}/Videos/${itemId}/master.m3u8?mediaSourceId=${ms.Id || itemId}&PlaySessionId=${playSessionId}`,
  };
}
