import { describe, expect, it, vi } from 'vitest';

import { findUpdate, parseRelease, summarizeNotes, versionCodeOf } from './appUpdate';

const apk = (version: string) => ({
  name: `Vela-${version}-android.apk`,
  browser_download_url: `https://github.com/v4lgrind/vela/releases/download/v${version}/Vela-${version}-android.apk`,
  size: 37_264_851,
});

const release = (version: string, extra: Record<string, unknown> = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  body: '',
  assets: [{ name: `Vela-${version}-linux-x86_64.AppImage`, browser_download_url: 'x', size: 1 }, apk(version)],
  ...extra,
});

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('versionCodeOf', () => {
  it('matches the release workflow formula', () => {
    expect(versionCodeOf('v1.4.0')).toBe(10400);
    expect(versionCodeOf('1.5.12')).toBe(10512);
    expect(versionCodeOf('v2.0.0')).toBe(20000);
  });

  it('rejects tags that are not plain semver', () => {
    expect(versionCodeOf('nightly-20261124-ee254f5')).toBeNull();
    expect(versionCodeOf('v1.4.0-beta.1')).toBeNull();
    expect(versionCodeOf('v1.100.0')).toBeNull();
  });
});

describe('summarizeNotes', () => {
  it('keeps the change lines of generated notes without author and link', () => {
    const body = [
      "## What's Changed",
      '* feat: Plex support by @v4lgrind in https://github.com/v4lgrind/vela/pull/45',
      '* fix(ci): release workflow by @v4lgrind in https://github.com/v4lgrind/vela/pull/46',
      '',
      '**Full Changelog**: https://github.com/v4lgrind/vela/compare/v1.3.1...v1.4.0',
    ].join('\r\n');
    expect(summarizeNotes(body)).toEqual(['feat: Plex support', 'fix(ci): release workflow']);
  });

  it('returns nothing for empty notes', () => {
    expect(summarizeNotes(null)).toEqual([]);
  });
});

describe('parseRelease', () => {
  it('reads version, code and the Android asset', () => {
    expect(parseRelease(release('1.5.0'))).toMatchObject({
      version: '1.5.0',
      versionCode: 10500,
      apkUrl: apk('1.5.0').browser_download_url,
      size: 37_264_851,
    });
  });

  it('ignores prereleases, drafts and releases without an APK', () => {
    expect(parseRelease(release('1.5.0', { prerelease: true }))).toBeNull();
    expect(parseRelease(release('1.5.0', { draft: true }))).toBeNull();
    expect(parseRelease(release('1.5.0', { assets: [] }))).toBeNull();
  });

  it('only accepts APKs hosted on the Vela repository', () => {
    const foreign = { ...apk('1.5.0'), browser_download_url: 'https://evil.example/Vela-1.5.0-android.apk' };
    expect(parseRelease(release('1.5.0', { assets: [foreign] }))).toBeNull();
  });
});

describe('findUpdate', () => {
  it('returns the latest release when it is newer than the installed build', async () => {
    const update = await findUpdate(10400, respond(release('1.5.0')));
    expect(update?.version).toBe('1.5.0');
  });

  it('returns null when the installed build is up to date or newer', async () => {
    expect(await findUpdate(10500, respond(release('1.5.0')))).toBeNull();
    expect(await findUpdate(10501, respond(release('1.5.0')))).toBeNull();
  });

  it('throws on an HTTP error', async () => {
    await expect(findUpdate(10400, respond({ message: 'Not Found' }, 404))).rejects.toThrow('HTTP 404');
  });
});
