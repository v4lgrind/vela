# Brand assets

Vector sources for the app's visual identity — the **"Stream Play"** mark: a
rounded play triangle inside a ~320° progress ring, in a blue→cyan gradient
(`#6FDCFF → #35A6FF → #2F86FF`, app accent `#2F9BFF`) on OLED black, matching
the app's OLED design direction.

## Sources

| File | Used for |
| --- | --- |
| `icon.svg` | App icon tile (rounded square) — source of `assets/icon.png`, web/PWA icons, Android legacy `ic_launcher`, Electron icon |
| `icon-round.svg` | Android `ic_launcher_round` (circular tile) |
| `adaptive-foreground.svg` | Android adaptive-icon foreground (`ic_launcher_foreground`) — mark only, transparent |
| `adaptive-background.svg` | Android adaptive-icon background (`ic_launcher_background`) — full-bleed black + faint glow |
| `favicon.svg` | Browser tab favicon (`public/favicon.svg`) |
| `generate.mjs` | Emits the master SVGs + one SVG per splash size |
| `build.sh` | Rasterizes everything into place at the exact sizes the project expects |

## Regenerate

```bash
apt-get install -y librsvg2-bin webp   # rsvg-convert + cwebp
bash assets/brand/build.sh             # run from repo root
```

`build.sh` regenerates the source `assets/icon.png` and `assets/splash*.png`,
the `icons/*` web/Electron icons, `public/favicon.svg`, and every Android
`mipmap-*` launcher icon and `drawable-*/splash.png` at their existing
dimensions. After changing icons, also run `npx cap sync android`.

> Note: `@capacitor/assets` (the usual generator) needs a native `sharp`
> build that isn't installable in every environment, so this pipeline uses
> `rsvg-convert` + `cwebp` directly and writes the same files.
