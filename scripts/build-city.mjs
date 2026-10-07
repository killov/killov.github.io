// Stáhne z OpenStreetMap (Overpass API) budovy, silnice, vodu a zeleň
// v okolí míst z CV a uloží je jako kompaktní JSON pro 3D město
// (public/places/olomouc.json).
//
//   node scripts/build-city.mjs
//
// Data © OpenStreetMap contributors, ODbL — atribuce je v UI města.
// Souřadnice jsou v decimetrech vůči středu (x = východ, z = jih).

import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";

const PLACES = {
    up: {lat: 49.59249, lon: 17.26347},
    spse: {lat: 49.58986, lon: 17.27232},
    quadient: {lat: 49.59034, lon: 17.26666},
    worldee: {lat: 49.59968, lon: 17.22595},
};

const lats = Object.values(PLACES).map((p) => p.lat);
const lons = Object.values(PLACES).map((p) => p.lon);
const PAD_LAT = 0.0045;
const PAD_LON = 0.0065;
const bbox = [Math.min(...lats) - PAD_LAT, Math.min(...lons) - PAD_LON, Math.max(...lats) + PAD_LAT, Math.max(...lons) + PAD_LON];
const center = {lat: (bbox[0] + bbox[2]) / 2, lon: (bbox[1] + bbox[3]) / 2};
const M_LAT = 111132;
const M_LON = 111320 * Math.cos((center.lat * Math.PI) / 180);
const toXZ = (lat, lon) => [Math.round((lon - center.lon) * M_LON * 10), Math.round(-(lat - center.lat) * M_LAT * 10)];

const b = bbox.join(",");
const query = `[out:json][timeout:120];
(
  way["building"](${b});
  relation["building"]["type"="multipolygon"](${b});
  way["highway"](${b});
  way["natural"="water"](${b});
  way["waterway"~"river|canal"](${b});
  way["landuse"~"grass|forest|meadow|recreation_ground"](${b});
  way["leisure"~"park|pitch|garden"](${b});
  way["railway"~"rail|tram"](${b});
);
out geom;`;

// OSM_CACHE=soubor: použije uložený výsledek Overpassu (a uloží ho, když neexistuje)
const CACHE = process.env.OSM_CACHE;
let elements;
if (CACHE && existsSync(CACHE)) {
    ({elements} = JSON.parse(readFileSync(CACHE, "utf8")));
} else {
    // hlavní server bývá přetížený, zkusí se další mirrory
    const endpoints = [process.env.OVERPASS, "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"].filter(Boolean);
    for (const endpoint of endpoints) {
        console.log("Overpass:", endpoint, bbox);
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "killov-portfolio-build/1.0"},
            body: "data=" + encodeURIComponent(query),
        });
        if (!res.ok) {
            console.log("  →", res.status);
            continue;
        }
        const text = await res.text();
        if (CACHE) writeFileSync(CACHE, text);
        ({elements} = JSON.parse(text));
        break;
    }
    if (!elements) throw new Error("Overpass nedostupný");
}
console.log("elements:", elements.length);

/** polyline jako [x0, z0, dx1, dz1, …] v decimetrech (delta = menší JSON) */
const flat = (geom) => {
    const out = [];
    let px = 0;
    let pz = 0;
    geom.forEach((g, i) => {
        const [x, z] = toXZ(g.lat, g.lon);
        if (i === 0 || x !== px || z !== pz) out.push(x - (i ? px : 0), z - (i ? pz : 0));
        px = x;
        pz = z;
    });
    return out;
};
const absolute = (p) => {
    const out = p.slice();
    for (let i = 2; i < out.length; i++) out[i] += out[i - 2];
    return out;
};

function height(tags) {
    const h = parseFloat(tags.height);
    if (!Number.isNaN(h)) return h;
    const lv = parseFloat(tags["building:levels"]);
    if (!Number.isNaN(lv)) return lv * 3.2 + 1.5;
    const t = tags.building;
    if (["house", "detached", "semidetached_house", "bungalow"].includes(t)) return 7.5;
    if (["garage", "garages", "shed", "carport", "roof", "hut", "kiosk"].includes(t)) return 3;
    if (["apartments", "dormitory", "hospital"].includes(t)) return 16;
    if (["university", "school", "college", "commercial", "office", "public"].includes(t)) return 15;
    if (["church", "cathedral"].includes(t)) return 24;
    if (["industrial", "warehouse", "retail"].includes(t)) return 9;
    return 10;
}

const ROAD_W = {motorway: 22, trunk: 18, primary: 16, secondary: 13, tertiary: 11, unclassified: 8, residential: 8, living_street: 7, service: 5, pedestrian: 6, track: 3};

const buildings = [];
const roads = [];
const water = [];
const green = [];
const rails = [];
const rivers = [];

for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "way" && tags.building && el.geometry?.length > 3) {
        buildings.push({h: height(tags), p: flat(el.geometry), name: tags.name ?? "", id: el.id});
    } else if (el.type === "relation" && tags.building) {
        for (const m of el.members ?? []) {
            if (m.role === "outer" && m.geometry?.length > 3) buildings.push({h: height(tags), p: flat(m.geometry), name: tags.name ?? "", id: el.id});
        }
    } else if (el.type === "way" && tags.highway && ROAD_W[tags.highway] && el.geometry) {
        if (tags.area === "yes" || tags.tunnel === "yes") continue;
        roads.push([ROAD_W[tags.highway], ...flat(el.geometry)]);
    } else if (el.type === "way" && tags.natural === "water" && el.geometry) {
        water.push(flat(el.geometry));
    } else if (el.type === "way" && tags.waterway && el.geometry) {
        rivers.push([tags.waterway === "river" ? 30 : 8, ...flat(el.geometry)]);
    } else if (el.type === "way" && (tags.landuse || tags.leisure) && el.geometry?.length > 3) {
        green.push(flat(el.geometry));
    } else if (el.type === "way" && tags.railway && el.geometry) {
        rails.push(flat(el.geometry));
    }
}

/** budova, která obsahuje bod (nebo nejbližší) */
function inside(x, z, p) {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
}
const places = {};
for (const [id, pl] of Object.entries(PLACES)) {
    const [x, z] = toXZ(pl.lat, pl.lon);
    const abs = buildings.map((bd) => absolute(bd.p));
    let best = abs.findIndex((p) => inside(x, z, p));
    if (best < 0) {
        let bestD = Infinity;
        abs.forEach((p, i) => {
            for (let k = 0; k < p.length; k += 2) {
                const d = Math.hypot(p[k] - x, p[k + 1] - z);
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
        });
    }
    // celý areál stejného jména (např. fakulta má víc budov)
    const name = buildings[best].name;
    console.log(id, "→", buildings[best].id, name || "(bez jména)", buildings[best].h + " m");
    places[id] = {x, z, b: best};
}

const out = {
    attribution: "© OpenStreetMap contributors (ODbL)",
    center: [center.lat, center.lon],
    places,
    b: buildings.map((bd) => [Math.round(bd.h * 10), ...bd.p]),
    r: roads,
    w: water,
    v: rivers,
    g: green,
    t: rails,
};
mkdirSync("public/places", {recursive: true});
const json = JSON.stringify(out);
writeFileSync("public/places/olomouc.json", json);
console.log(`budov ${buildings.length}, silnic ${roads.length}, ${(json.length / 1024).toFixed(0)} kB`);
