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
  /** Native ExoPlayer passes the token via an auth header; web DirectPlay
   *  uses <video>.src and must carry the token in the URL. */
  isNative: boolean;
  playSessionId: string;
}

// HLS.js and ExoPlayer authenticate via headers. A server-supplied stream URL
// can contain a legacy query token, which must not accompany that header.
export function withoutPlaybackApiKey(url: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = base.indexOf('?');
  if (queryIndex === -1 || !/[?&](?:api_key|ApiKey)(?:=|&|$)/.test(base)) return url;
  const params = base.slice(queryIndex + 1).split('&')
    .filter(param => !/^(?:api_key|ApiKey)(?:=|$)/.test(param));
  const query = params.some(param => param.length > 0) ? `?${params.join('&')}` : '';
  return base.slice(0, queryIndex) + query + (hashIndex === -1 ? '' : url.slice(hashIndex));
}

// Jellyfin honours maxWidth/maxHeight on the stream URL and re-encodes when the
// source exceeds them. Existing values are replaced case-insensitively so
// ASP.NET never sees duplicate keys. Relative server URLs stay relative.
export function withMaxVideoSize(url: string, maxWidth: number, maxHeight: number): string {
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(url);
  const parsed = new URL(url, 'http://relative.invalid');
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower === 'maxwidth' || lower === 'maxheight') parsed.searchParams.delete(key);
  }
  parsed.searchParams.set('maxWidth', String(maxWidth));
  parsed.searchParams.set('maxHeight', String(maxHeight));
  return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

// A <video> element (including native Safari HLS) cannot attach auth headers.
export function withPlaybackApiKey(url: string, accessToken: string): string {
  const cleanUrl = withoutPlaybackApiKey(url);
  const hashIndex = cleanUrl.indexOf('#');
  const base = hashIndex === -1 ? cleanUrl : cleanUrl.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : cleanUrl.slice(hashIndex);
  return `${base}${base.includes('?') ? '&' : '?'}ApiKey=${encodeURIComponent(accessToken)}${fragment}`;
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
    const url = `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true&mediaSourceId=${encodeURIComponent(msId)}`;
    return {
      method: 'DirectPlay',
      url: isNative ? url : withPlaybackApiKey(url, accessToken),
    };
  }

  const method: PlaybackMethod = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
  if (ms.TranscodingUrl) {
    return { method, url: withoutPlaybackApiKey(`${serverUrl}${ms.TranscodingUrl}`.replace('?&', '?')) };
  }
  return {
    method,
    url: `${serverUrl}/Videos/${encodeURIComponent(itemId)}/master.m3u8?mediaSourceId=${encodeURIComponent(ms.Id || itemId)}&PlaySessionId=${encodeURIComponent(playSessionId)}`,
  };
}
