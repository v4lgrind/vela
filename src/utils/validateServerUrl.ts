import { i18n } from '@/i18n';

/**
 * Validates a Jellyfin server URL. Returns an error message to display, or
 * null when the URL is acceptable (well-formed and http/https).
 */
export function validateServerUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return i18n.global.t('login.urlProtocol');
    }
    return null;
  } catch {
    return i18n.global.t('login.urlInvalid');
  }
}
