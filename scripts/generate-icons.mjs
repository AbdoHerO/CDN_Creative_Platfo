/**
 * Generate the app icons (home-screen / install) from the Creative Hub mark:
 * `node scripts/generate-icons.mjs`. Writes PNGs to public/icons (committed).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const out = join(process.cwd(), "public", "icons");
mkdirSync(out, { recursive: true });

/** The brand mark (same shapes as components/brand.tsx) on an indigo → violet background. */
function svg(size, { rounded, glyphScale }) {
  const radius = rounded ? size * 0.22 : 0;
  const glyph = size * glyphScale;
  const offset = (size - glyph) / 2;
  const s = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F46E5"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${offset} ${offset}) scale(${s})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/>
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" opacity="0.55"/>
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" opacity="0.55"/>
    <path d="M14.5 14.2v5.6l4.6-2.8z" fill="#fff" stroke="none"/>
  </g>
</svg>`;
}

const icons = [
  { file: "icon-192.png", size: 192, rounded: true, glyphScale: 0.62 },
  { file: "icon-512.png", size: 512, rounded: true, glyphScale: 0.62 },
  // Android crops maskable icons to a circle or squircle: keep the glyph inside the safe zone.
  { file: "icon-maskable-512.png", size: 512, rounded: false, glyphScale: 0.5 },
  // iOS rounds the corners itself and does not support transparency.
  { file: "apple-touch-icon.png", size: 180, rounded: false, glyphScale: 0.6 },
];
for (const icon of icons) {
  await sharp(Buffer.from(svg(icon.size, icon))).png().toFile(join(out, icon.file));
  console.log(`✔ public/icons/${icon.file}`);
}
