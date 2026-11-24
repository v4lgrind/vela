# 2026-11-24 — Distribution outside the Play Store: signing + in-app updates

Branch: `feat/self-update` (not pushed).

## Goal

Make Vela easy to install and update without the Play Store: public GitHub
releases, a safe signing key, and an in-app updater.

## Done

1. **Pre-publication checks** (`a32650a`)
   - gitleaks over the full history (355 commits): no real secret. The only hits
     were `tagKey` fields of the anonymised Plex fixtures, allowlisted in
     `.gitleaks.toml`.
   - `LICENSE` (MIT, matching `package.json`).
2. **Rotated release signing key** (`d591c73`)
   - New release key (RSA 4096) in `~/.config/vela-signing/` (outside the repo),
     cert SHA-256 `c7e4fdcb…62ebf6`.
   - APK Signature Scheme v3 rotation: `android/signing/lineage.bin` links the
     legacy committed key to the release key. Legacy key has no rollback
     capability.
   - `scripts/sign-android-apk.sh` re-signs an APK and checks the fingerprint.
     Called by `npm run android:build` / `android:release` and by both CI
     workflows, which now build `assembleRelease` (non-debuggable).
   - Documented in `docs/development.md` → Signing.
3. **In-app updater** (`c049f08`)
   - `AppUpdatePlugin.kt`: https download into the cache with progress, package
     name + versionCode check, system installer via FileProvider;
     `REQUEST_INSTALL_PACKAGES` permission.
   - `src/services/appUpdate.ts`: reads `releases/latest` of `v4lgrind/vela`,
     versionCode from the tag (same formula as `release.yml`), ignores
     prereleases and assets outside the repo, summarises the generated notes.
   - `app-update-store.ts`: startup check every 6 h max, permission flow
     (continues on resume), "Later" per version, reinstall without re-download.
   - UI: bottom sheet at startup (`AppUpdatePrompt.vue`), Settings → App section
     (version, check, update with progress).
   - `build.gradle` reads `ANDROID_VERSION_NAME`; `release.yml` passes it.

## Verified

- vue-tsc clean, vitest 417/417, JVM test `UpdateApkCheckTest`.
- `apksigner`: API 24–27 see the legacy cert, API 28+ the release cert with lineage.
- **Pixel 10 (Android 17)**: test build 10401 installed with `install -r` over
  v1.4.0 (legacy key) → accepted, data kept. Then the full in-app flow against a
  local fake release (adb reverse): sheet → permission → download → system
  installer → 1.4.2-dev (10402) installed, data kept. The test build's local URL
  patch was never committed.

## Left to do

- **GitHub secrets** `VELA_SIGNING_KEYSTORE_B64` (base64 of the .p12) and
  `VELA_SIGNING_PASSWORD`: the `gh secret set` call was blocked by auto mode;
  needs the user's approval or to be run by hand. Until then nightly/release
  publishing fails on purpose (`--require`).
- Back up `~/.config/vela-signing/` in Bitwarden (user doing it).
- Make the repo public (user's action) — the updater and Obtainium need public
  release assets; with a private repo the check gets a 404 and stays silent.
- Open the PR / merge, then publish a release (e.g. v1.5.0) and check that the
  phone (10402) and the tablet (10400, legacy key) are offered it.
- Separate issue: nightly versionCodes (run number + 1000 ≈ 1300) are lower than
  release codes (10400+), so a nightly can't be installed over a release.
