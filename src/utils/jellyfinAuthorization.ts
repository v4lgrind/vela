// A token-only MediaBrowser header is valid for endpoints without a SDK Api instance.
// Percent-encode the value as required by Jellyfin's authorization scheme.
export function jellyfinAuthorization(accessToken: string): string {
  return `MediaBrowser Token="${encodeURIComponent(accessToken)}"`;
}
