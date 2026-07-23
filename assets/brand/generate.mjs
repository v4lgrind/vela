// Visual identity generator — "Stream Play" mark
// Media/play symbol: rounded play triangle + progress ring, blue→cyan on OLED black.
// Emits master SVGs + per-size splash SVGs. Rasterization done by render.sh (rsvg-convert/cwebp).
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2]; // scratchpad svg dir
mkdirSync(`${OUT}/splash`, { recursive: true });

// ---- palette ----
const CYAN = '#6FDCFF';
const BLUE_MID = '#35A6FF';
const BLUE_DEEP = '#2F86FF';
const ACCENT = '#2F9BFF';
const LIGHT_BG = '#EEF1F5';
const DARK_BG = '#000000';

// ---- shared defs (blue gradient, glow filter) ----
function defs(p) {
  return `
  <defs>
    <linearGradient id="${p}-blue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="55%" stop-color="${BLUE_MID}"/>
      <stop offset="100%" stop-color="${BLUE_DEEP}"/>
    </linearGradient>
    <radialGradient id="${p}-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}-tile" cx="50%" cy="37%" r="80%">
      <stop offset="0%" stop-color="#0E1826"/>
      <stop offset="55%" stop-color="#060A11"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <filter id="${p}-soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>`;
}

// ---- the mark itself (progress ring + play triangle), in a 0..1024 box centered at 512 ----
function mark(p) {
  // ring: ~320° arc, 40° gap centered at top (θ 250°..290°)
  const ring = `M614.6 230.1 A300 300 0 1 1 409.4 230.1`;
  const tri = `M432 372 L432 652 L668 512 Z`;
  return `
    <circle cx="512" cy="512" r="300" fill="url(#${p}-halo)"/>
    <path d="${ring}" fill="none" stroke="url(#${p}-blue)" stroke-width="42" stroke-linecap="round"/>
    <g filter="url(#${p}-soft)" opacity="0.55">
      <path d="${tri}" fill="${ACCENT}" stroke="${ACCENT}" stroke-width="46" stroke-linejoin="round" stroke-linecap="round"/>
    </g>
    <path d="${tri}" fill="url(#${p}-blue)" stroke="url(#${p}-blue)" stroke-width="46" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// ---- compositions ----
function iconTile(round) {
  const p = 'i';
  const bg = round
    ? `<circle cx="512" cy="512" r="512" fill="url(#${p}-tile)"/>`
    : `<rect width="1024" height="1024" rx="224" fill="url(#${p}-tile)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs(p)}${bg}${mark(p)}</svg>`;
}

function foreground() {
  const p = 'f';
  // tight viewBox around the mark so it fills the adaptive foreground frame
  return `<svg xmlns="http://www.w3.org/2000/svg" width="724" height="724" viewBox="150 150 724 724">${defs(p)}${mark(p)}</svg>`;
}

function adaptiveBg() {
  const p = 'b';
  // full-bleed (mask applies shape); black + faint top glow
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="${p}-g" cx="50%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#0A121C"/>
      <stop offset="60%" stop-color="#03060A"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#${p}-g)"/></svg>`;
}

function favicon() {
  // crisp, minimal (favicons render small) — rounded black tile + ring + play, no blur
  const ring = `M614.6 230.1 A300 300 0 1 1 409.4 230.1`;
  const tri = `M432 372 L432 652 L668 512 Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="fav" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="55%" stop-color="${BLUE_MID}"/>
      <stop offset="100%" stop-color="${BLUE_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#05080D"/>
  <path d="${ring}" fill="none" stroke="url(#fav)" stroke-width="46" stroke-linecap="round"/>
  <path d="${tri}" fill="url(#fav)" stroke="url(#fav)" stroke-width="48" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

// splash: bg color + centered icon tile, sized per canvas
function splash(w, h, dark) {
  const p = 's';
  const bg = dark ? DARK_BG : LIGHT_BG;
  const frac = 0.34;
  const k = (Math.min(w, h) * frac) / 1024;
  const cx = w / 2, cy = h / 2;
  const tile = dark
    ? `<circle cx="512" cy="512" r="512" fill="url(#${p}-tile)"/>` // on black, round tile blends; mark floats
    : `<rect width="1024" height="1024" rx="224" fill="url(#${p}-tile)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(p)}
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${cx} ${cy}) scale(${k.toFixed(5)}) translate(-512 -512)">${tile}${mark(p)}</g></svg>`;
}

// ---- write master SVGs ----
writeFileSync(`${OUT}/icon_tile.svg`, iconTile(false));
writeFileSync(`${OUT}/icon_round.svg`, iconTile(true));
writeFileSync(`${OUT}/fg.svg`, foreground());
writeFileSync(`${OUT}/bg.svg`, adaptiveBg());
writeFileSync(`${OUT}/favicon.svg`, favicon());

// ---- splash targets (mirror existing android paths + source assets) ----
const A = 'android/app/src/main/res';
const splashTargets = [
  // source assets
  ['assets/splash.png', 1080, 1920, false],
  ['assets/splash-dark.png', 1080, 1920, true],
];
const dens = {
  ldpi: 'ldpi', mdpi: 'mdpi', hdpi: 'hdpi', xhdpi: 'xhdpi', xxhdpi: 'xxhdpi', xxxhdpi: 'xxxhdpi',
};
// exact per-dir dimensions harvested from repo
const dims = {
  'drawable': [320, 480, false],
  'drawable-night': [320, 240, true],
  'drawable-port-ldpi': [240, 320, false],
  'drawable-port-mdpi': [320, 480, false],
  'drawable-port-hdpi': [480, 800, false],
  'drawable-port-xhdpi': [720, 1280, false],
  'drawable-port-xxhdpi': [960, 1600, false],
  'drawable-port-xxxhdpi': [1280, 1920, false],
  'drawable-land-ldpi': [320, 240, false],
  'drawable-land-mdpi': [480, 320, false],
  'drawable-land-hdpi': [800, 480, false],
  'drawable-land-xhdpi': [1280, 720, false],
  'drawable-land-xxhdpi': [1600, 960, false],
  'drawable-land-xxxhdpi': [1920, 1280, false],
  'drawable-port-night-ldpi': [240, 320, true],
  'drawable-port-night-mdpi': [320, 480, true],
  'drawable-port-night-hdpi': [480, 800, true],
  'drawable-port-night-xhdpi': [720, 1280, true],
  'drawable-port-night-xxhdpi': [960, 1600, true],
  'drawable-port-night-xxxhdpi': [1280, 1920, true],
  'drawable-land-night-ldpi': [320, 240, true],
  'drawable-land-night-mdpi': [480, 320, true],
  'drawable-land-night-hdpi': [800, 480, true],
  'drawable-land-night-xhdpi': [1280, 720, true],
  'drawable-land-night-xxhdpi': [1600, 960, true],
  'drawable-land-night-xxxhdpi': [1920, 1280, true],
};
for (const [dir, [w, h, dark]] of Object.entries(dims)) {
  splashTargets.push([`${A}/${dir}/splash.png`, w, h, dark]);
}

const map = [];
splashTargets.forEach(([out, w, h, dark], idx) => {
  const svgName = `splash/${idx}.svg`;
  writeFileSync(`${OUT}/${svgName}`, splash(w, h, dark));
  map.push(`${svgName}\t${out}\t${w}\t${h}`);
});
writeFileSync(`${OUT}/splash_map.tsv`, map.join('\n') + '\n');

console.log(`wrote master SVGs + ${splashTargets.length} splash SVGs`);
