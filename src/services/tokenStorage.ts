import { Preferences } from '@capacitor/preferences';

/**
 * Access tokens live in Capacitor Preferences (Android SharedPreferences),
 * never in the persisted Pinia state. localStorage is only a fallback for
 * environments where Preferences throws.
 */
const PREFIX = 'vela_token:';

export async function readToken(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: PREFIX + key });
    return value;
  } catch {
    return localStorage.getItem(PREFIX + key);
  }
}

export async function writeToken(key: string, token: string | null): Promise<void> {
  try {
    if (token) await Preferences.set({ key: PREFIX + key, value: token });
    else await Preferences.remove({ key: PREFIX + key });
    localStorage.removeItem(PREFIX + key);
  } catch {
    if (token) localStorage.setItem(PREFIX + key, token);
    else localStorage.removeItem(PREFIX + key);
  }
}

/** Raw read of a pre-Vela-session key (used once by the legacy migration). */
export async function readLegacyPreference(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}
