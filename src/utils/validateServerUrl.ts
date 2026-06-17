/**
 * Validates a Jellyfin server URL. Returns an error message to display, or
 * null when the URL is acceptable (well-formed and http/https).
 */
export function validateServerUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Server URL must use http:// or https://';
    }
    return null;
  } catch {
    return 'Please enter a valid server URL (e.g. http://192.168.1.10:8096)';
  }
}
