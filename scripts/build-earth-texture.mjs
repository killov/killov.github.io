// Vygeneruje texturu Země pro holografickou planetu (public/textures/earth.webp
// + menší earth-1024.webp, která se načte jako první — rychlý start na mobilu).
//
//   node scripts/build-earth-texture.mjs <adresář s Natural Earth GeoJSON>
//
// Potřebuje ne_50m_land.geojson a ne_50m_admin_0_countries.geojson
// (https://github.com/nvkelso/natural-earth-vector, public domain).
// Equirectangular 2048×1024, kanály:
//   R = vzdálenost od pobřeží (128 = pobřeží, víc = pevnina), ±48 px
//   G = vzdálenost od hranice Česka (128 = hranice, víc = uvnitř), ±16 px
//   B = hranice států (antialiasovaná čára)

import {readFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import sharp from "sharp";

const W = 2048;
const H = 1024;
const dir = process.argv[2];
if (!dir) {
    console.error("Použití: node scripts/build-earth-texture.mjs <adresář s GeoJSON>");
    process.exit(1);
}

const land = JSON.parse(readFileSync(join(dir, "ne_50m_land.geojson"), "utf8"));
const countries = JSON.parse(readFileSync(join(dir, "ne_50m_admin_0_countries.geojson"), "utf8"));
const czechia = countries.features.find((f) => f.properties.ISO_A3 === "CZE");

const px = ([lon, lat]) => `${(((lon + 180) / 360) * W).toFixed(2)} ${(((90 - lat) / 180) * H).toFixed(2)}`;

function polygons(geometry) {
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    return [];
}

function pathOf(features) {
    let d = "";
    for (const f of features) {
        for (const poly of polygons(f.geometry)) {
            for (const ring of poly) {
                d += `M${ring.map(px).join("L")}Z`;
            }
        }
    }
    return d;
}

async function rasterize(svgBody) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${svgBody}</svg>`;
    const {data} = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = data[i * 3];
    return out;
}

/** 1D squared distance transform (Felzenszwalb & Huttenlocher) */
function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    const intersect = (q, r) => (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
    for (let q = 1; q < n; q++) {
        let s = intersect(q, v[k]);
        // z[0] = -∞, takže k nikdy neklesne pod 0
        while (s <= z[k]) {
            k--;
            s = intersect(q, v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        d[q] = (q - r) * (q - r) + f[r];
    }
}

/** vzdálenost (px) každého pixelu k nejbližšímu pixelu, kde target(i) == true */
function distanceTo(target) {
    const INF = 1e20;
    const grid = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) grid[i] = target(i) ? 0 : INF;
    const n = Math.max(W, H);
    const f = new Float64Array(n);
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) f[y] = grid[y * W + x];
        edt1d(f, H, d, v, z);
        for (let y = 0; y < H; y++) grid[y * W + x] = d[y];
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) f[x] = grid[y * W + x];
        edt1d(f, W, d, v, z);
        for (let x = 0; x < W; x++) grid[y * W + x] = Math.sqrt(d[x]);
    }
    return grid;
}

function signedField(mask, range) {
    const inside = (i) => mask[i] >= 128;
    const toOutside = distanceTo((i) => !inside(i));
    const toInside = distanceTo(inside);
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const sd = inside(i) ? toOutside[i] - 0.5 : -(toInside[i] - 0.5);
        out[i] = Math.round(128 + (Math.max(-range, Math.min(range, sd)) * 127) / range);
    }
    return out;
}

const landMask = await rasterize(`<path d="${pathOf(land.features)}" fill="#fff" fill-rule="evenodd"/>`);
const czMask = await rasterize(`<path d="${pathOf([czechia])}" fill="#fff" fill-rule="evenodd"/>`);
const borders = await rasterize(`<path d="${pathOf(countries.features)}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>`);

const landSdf = signedField(landMask, 48);
const czSdf = signedField(czMask, 16);

const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = landSdf[i];
    rgb[i * 3 + 1] = czSdf[i];
    rgb[i * 3 + 2] = borders[i];
}

mkdirSync("public/textures", {recursive: true});
// bezeztrátově: kanály jsou data (vzdálenostní pole), ztrátová komprese by je rozbila
const img = sharp(rgb, {raw: {width: W, height: H, channels: 3}});
await img.clone().webp({lossless: true, effort: 6}).toFile("public/textures/earth.webp");
await img.clone().resize(W / 2, H / 2, {kernel: "lanczos3"}).webp({lossless: true, effort: 6}).toFile("public/textures/earth-1024.webp");
console.log("public/textures/earth.webp + earth-1024.webp hotovo");
