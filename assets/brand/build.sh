#!/usr/bin/env bash
# Regenerate every brand asset (app icon, Android launcher/adaptive icons,
# splash screens, web/PWA icons, favicon) from the vector sources in this folder.
#
# Requirements: node, rsvg-convert (librsvg2-bin), cwebp (webp).
#   apt-get install -y librsvg2-bin webp
#
# Usage:  bash assets/brand/build.sh        # run from repo root
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
BRAND=assets/brand
WORK="$(mktemp -d)"
A=android/app/src/main/res
trap 'rm -rf "$WORK"' EXIT

# 1. emit master + per-size splash SVGs
node "$BRAND/generate.mjs" "$WORK"

png()  { rsvg-convert -w "$3" -h "$3" "$WORK/$1" -o "$2"; }
iwebp(){ rsvg-convert -w "$2" -h "$2" "$WORK/$1" -o "$WORK/w.png"; cwebp -quiet -q 90 -alpha_q 100 "$WORK/w.png" -o "$3"; }

# 2. source icon + web/electron icons + favicon
png icon_tile.svg assets/icon.png 1024
for s in 48 72 96 128 192 256 512; do iwebp icon_tile.svg $s icons/icon-$s.webp; done
png icon_tile.svg icons/icon-512.png 512
cp "$WORK/favicon.svg" public/favicon.svg

# 3. Android legacy launcher icons
declare -A LEG=( [ldpi]=36 [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
for d in "${!LEG[@]}"; do
  png icon_tile.svg  "$A/mipmap-$d/ic_launcher.png"       "${LEG[$d]}"
  png icon_round.svg "$A/mipmap-$d/ic_launcher_round.png" "${LEG[$d]}"
done

# 4. Android adaptive foreground / background
declare -A ADP=( [ldpi]=81 [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in "${!ADP[@]}"; do
  png fg.svg "$A/mipmap-$d/ic_launcher_foreground.png" "${ADP[$d]}"
  png bg.svg "$A/mipmap-$d/ic_launcher_background.png" "${ADP[$d]}"
done

# 5. Splash screens (source assets + every Android density/orientation/theme)
while IFS=$'\t' read -r svg out w h; do
  [ -z "$svg" ] && continue
  rsvg-convert -w "$w" -h "$h" "$WORK/$svg" -o "$out"
done < "$WORK/splash_map.tsv"

echo "Brand assets regenerated."
