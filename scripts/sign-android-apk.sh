#!/usr/bin/env bash
# Re-signs a Vela APK with the release key, rotated from the legacy key.
#
#   scripts/sign-android-apk.sh [--require] path/to/vela.apk
#
# Builds before v1.5.0 were signed with android/app/signing.keystore, whose
# password is public. APK Signature Scheme v3 key rotation keeps updates
# working: android/signing/lineage.bin proves the legacy key authorised the
# release key, so Android 9+ installs the new build over an existing one and
# keeps its data. The legacy key has no rollback capability in the lineage, so
# once a rotated build is installed, an APK signed only with the legacy key is
# refused as an update. Android 7–8 (API 24–27) still verify the v1/v2
# signatures, which stay on the legacy key.
#
# The release key never enters the repository. It comes from the environment
# (CI secrets) or from $VELA_SIGNING_ENV (default ~/.config/vela-signing/signing.env):
#   VELA_SIGNING_KEYSTORE  PKCS12 keystore path
#   VELA_SIGNING_PASSWORD  keystore and key password
#   VELA_SIGNING_ALIAS     key alias (default: vela)
#
# Without the key the APK keeps its Gradle signature (legacy key only) and the
# script exits 0, unless --require is given (CI publishing jobs).

set -euo pipefail

# SHA-256 of the release certificate: guards against a wrong key in CI secrets.
readonly RELEASE_CERT_SHA256="c7e4fdcb43e3464390e90c96cd958e4f26ee395606a2d921a433304ceb62ebf6"
readonly LEGACY_KEYSTORE_PASS="mediaserver"

require=false
if [[ "${1:-}" == "--require" ]]; then
  require=true
  shift
fi
apk="${1:?usage: sign-android-apk.sh [--require] path/to/vela.apk}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${VELA_SIGNING_ENV:-$HOME/.config/vela-signing/signing.env}"
if [[ -z "${VELA_SIGNING_KEYSTORE:-}" && -f "$env_file" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$env_file"
  set +a
fi

if [[ -z "${VELA_SIGNING_KEYSTORE:-}" || -z "${VELA_SIGNING_PASSWORD:-}" ]]; then
  if $require; then
    echo "error: release signing key not configured (VELA_SIGNING_KEYSTORE / VELA_SIGNING_PASSWORD)" >&2
    exit 1
  fi
  echo "warning: no release signing key, $apk keeps the legacy signature" >&2
  exit 0
fi

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
apksigner="$(find "$sdk/build-tools" -maxdepth 2 -name apksigner | sort -V | tail -1)"
if [[ -z "$apksigner" ]]; then
  echo "error: apksigner not found under $sdk/build-tools" >&2
  exit 1
fi

export VELA_SIGNING_PASSWORD
"$apksigner" sign \
  --ks "$root/android/app/signing.keystore" --ks-key-alias mediaserver \
  --ks-pass "pass:$LEGACY_KEYSTORE_PASS" --key-pass "pass:$LEGACY_KEYSTORE_PASS" \
  --next-signer \
  --ks "$VELA_SIGNING_KEYSTORE" --ks-key-alias "${VELA_SIGNING_ALIAS:-vela}" \
  --ks-pass env:VELA_SIGNING_PASSWORD \
  --lineage "$root/android/signing/lineage.bin" \
  --rotation-min-sdk-version 28 \
  "$apk"

certs="$("$apksigner" verify --print-certs --min-sdk-version 28 "$apk")"
if ! grep -q "certificate SHA-256 digest: $RELEASE_CERT_SHA256" <<<"$certs"; then
  echo "error: $apk is not signed with the expected release certificate" >&2
  echo "$certs" >&2
  exit 1
fi
echo "Signed $apk with the release key (rotated from the legacy key)"
