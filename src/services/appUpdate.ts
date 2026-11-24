/**
 * Finds newer Vela releases on GitHub. The Android versionCode of a release is
 * derived from its tag exactly like .github/scripts/android-version.sh does:
 * MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 (v1.5.0 → 1050000). Nightlies
 * add 1–99 to the code of the release they follow.
 */

export const RELEASE_REPO = 'v4lgrind/vela';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const ASSET_URL_PREFIX = `https://github.com/${RELEASE_REPO}/releases/download/`;
const MAX_NOTES = 6;

export interface AvailableUpdate {
  version: string;
  versionCode: number;
  apkUrl: string;
  /** APK size in bytes. */
  size: number;
  /** One line per change, from the generated release notes. */
  notes: string[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  body?: string | null;
  assets?: GitHubAsset[];
}

/** `v1.4.0` / `1.4.0` → versionCode, or null for anything else. */
export function versionCodeOf(tag: string): number | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) return null;
  return major * 1_000_000 + minor * 10_000 + patch * 100;
}

/**
 * Change lines of GitHub's generated notes ("* feat: x by @me in https://…/pull/45"),
 * without the author and PR link.
 */
export function summarizeNotes(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .filter((line) => /^\s*[*-]\s+/.test(line))
    .map((line) => line.replace(/^\s*[*-]\s+/, '').replace(/\s+by @\S+ in https?:\/\/\S+$/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

function androidAsset(release: GitHubRelease): GitHubAsset | undefined {
  return release.assets?.find(
    (asset) => asset.name.endsWith('-android.apk') && asset.browser_download_url.startsWith(ASSET_URL_PREFIX),
  );
}

/** The release as an update, or null when it isn't a published Android release. */
export function parseRelease(release: GitHubRelease): AvailableUpdate | null {
  if (release.draft || release.prerelease || !release.tag_name) return null;
  const versionCode = versionCodeOf(release.tag_name);
  const asset = androidAsset(release);
  if (versionCode === null || !asset) return null;
  return {
    version: release.tag_name.replace(/^v/, ''),
    versionCode,
    apkUrl: asset.browser_download_url,
    size: asset.size,
    notes: summarizeNotes(release.body),
  };
}

/** The latest release when it is newer than the installed build, else null. */
export async function findUpdate(installedCode: number, fetchImpl: typeof fetch = fetch): Promise<AvailableUpdate | null> {
  const response = await fetchImpl(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`);
  const update = parseRelease((await response.json()) as GitHubRelease);
  return update && update.versionCode > installedCode ? update : null;
}
