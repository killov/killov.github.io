// Vygeneruje náhledový obrázek pro sdílení (public/og.png, 1200×630) —
// og:image / twitter:image. Po změně role nebo projektů pusť znovu:
//
//   node scripts/build-og-image.mjs

import {readFileSync} from "node:fs";
import sharp from "sharp";

const W = 1200;
const H = 630;
const PHOTO = 220;

const photo = await sharp(readFileSync(new URL("../src/app/zdenek.jpg", import.meta.url)))
    .resize(PHOTO, PHOTO)
    .composite([{
        input: Buffer.from(`<svg width="${PHOTO}" height="${PHOTO}"><circle cx="${PHOTO / 2}" cy="${PHOTO / 2}" r="${PHOTO / 2}"/></svg>`),
        blend: "dest-in",
    }])
    .png()
    .toBuffer();

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="78%" cy="38%" r="60%">
      <stop offset="0" stop-color="#2f6bff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#0a0d12" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0d12"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#38d6ff" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="${W - 230}" cy="250" r="${PHOTO / 2 + 6}" fill="none" stroke="#38d6ff" stroke-width="3"/>
  <g font-family="DejaVu Sans, Liberation Sans, sans-serif">
    <text x="80" y="120" fill="#38d6ff" font-size="26" font-family="DejaVu Sans Mono, monospace" letter-spacing="2">◢ KILLOV.OS</text>
    <text x="80" y="230" fill="#e8f1ff" font-size="72" font-weight="700">Zdeněk Mazurák</text>
    <text x="80" y="300" fill="#bfe6ff" font-size="34">Senior backend · full-stack</text>
    <text x="80" y="350" fill="#bfe6ff" font-size="34">Worldee · WorkMux · AI dev tools</text>
    <text x="80" y="450" fill="#8aa0b8" font-size="26" font-family="DejaVu Sans Mono, monospace">PHP/Nette · C#/.NET · React · Next.js · Three.js</text>
    <text x="80" y="550" fill="#38d6ff" font-size="28" font-family="DejaVu Sans Mono, monospace">killov.github.io</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg))
    .composite([{input: photo, left: W - 230 - PHOTO / 2, top: 250 - PHOTO / 2}])
    .png({compressionLevel: 9})
    .toFile(new URL("../public/og.png", import.meta.url).pathname);

console.log("public/og.png");
