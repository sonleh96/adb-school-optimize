// Draws public/images/png-provinces.svg: Papua New Guinea's 22 provinces, one path each, with its World Bank code as
// its id and its name in data-name. The homepage shows the file as a faint picture; the explore page's province map
// reads the paths by name and shades them. No school, mark or label is drawn.
//
// Source: World Bank Official Boundaries, version 2, Admin 1 (CC BY 4.0), the file the repository's
// datasets/PNG_provinces.geojson was cut from (its 22 features are identical). Download it, check it, then run:
//   curl -o adm1.geojson "https://datacatalogfiles.worldbank.org/ddh-published/0038272/2/DR0095369/World%20Bank%20Official%20Boundaries%20%28GeoJSON%29/World%20Bank%20Official%20Boundaries%20-%20Admin%201.geojson"
//   shasum -a 256 adm1.geojson   # 2cd52d0ebea4889850471597c84222eeb817bc0077ac9d49bbcfed7d5faac2b6, 254,535,760 bytes
//   node scripts/build-province-map.mjs adm1.geojson public/images/png-provinces.svg
// The catalog page is https://datacatalog.worldbank.org/search/dataset/0038272; version 3 (21 October 2026) has the
// same 22 names and codes with slightly different lines. The script reads only Papua New Guinea's features, one per
// line as the World Bank writes them, so the whole file is never held in memory; datasets/PNG_provinces.geojson works
// as the source too. It needs no package.
//
// Province borders are shared, so each is simplified once: the rings are cut into arcs at the points where three or
// more boundaries meet, each arc is simplified on its own with its ends fixed, and every province is rebuilt from the
// same simplified arcs. Two neighbours therefore never draw two versions of their border, and no gap opens between
// them. Islands smaller than --min-area are left out; they belong to one province each, so no shared border breaks.
// The method and its defaults are the ones that drew the homepage's first version of this file: with them, every
// province's outline and every border line comes out exactly as that version drew it.
//
// Every point is written as "L<x>,<y>" with no spaces, so no coordinate stands alone where the repository's history
// scan looks for the study's counts.
// Usage: node build-province-map.mjs <source.geojson> <out.svg> [--width 1000] [--tolerance 1] [--min-area 45]
//   --tolerance in output pixels; --min-area in square output pixels.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [source, out, ...rest] = process.argv.slice(2);
if (!source || !out) {
  console.error(
    "usage: node build-province-map.mjs <source.geojson> <out.svg> [--width 1000] [--tolerance 1] [--min-area 45]"
  );
  process.exit(2);
}
const opt = (flag, fallback) => {
  const i = rest.indexOf(flag);
  return i >= 0 ? Number(rest[i + 1]) : fallback;
};
const WIDTH = opt("--width", 1000);
const TOLERANCE = opt("--tolerance", 1);
const MIN_AREA = opt("--min-area", 45);
const Q = 8; // grid steps per output pixel, for matching shared points exactly
const PROVINCES = 22;

// Version 3 of the source prefixes some names and values with a byte-order mark; it is dropped from both.
const clean = (value) => (typeof value === "string" ? value.replace(/^﻿/, "") : value);
const cleaned = (props) => Object.fromEntries(Object.entries(props).map(([k, v]) => [clean(k), clean(v)]));

/** Papua New Guinea's admin-1 features: each line that holds a feature is parsed only if it names the country. */
async function readProvinces(path) {
  const found = [];
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"Feature"') || !line.includes("PNG")) continue;
    const feature = JSON.parse(line.trim().replace(/,$/, ""));
    const props = cleaned(feature.properties);
    if (props.ISO_A3 === "PNG") found.push({ ...feature, properties: props });
  }
  return found;
}

const features = (await readProvinces(source)).sort((a, b) =>
  a.properties.ADM1CD_c.localeCompare(b.properties.ADM1CD_c)
);
const names = new Set(features.map((f) => f.properties.NAM_1));
const codes = new Set(features.map((f) => f.properties.ADM1CD_c));
if (features.length !== PROVINCES || names.size !== PROVINCES || codes.size !== PROVINCES) {
  console.error(
    `expected ${PROVINCES} provinces with distinct names and codes, found ${features.length} features, ` +
      `${names.size} names and ${codes.size} codes in ${source}`
  );
  process.exit(1);
}
const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

// Projection: plate carrée with the longitude scaled by the cosine of the middle latitude; PNG lies near the equator.
let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
for (const f of features)
  for (const poly of polygonsOf(f.geometry))
    for (const [lon, lat] of poly[0]) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
const scale = WIDTH / ((maxLon - minLon) * kx);
const HEIGHT = Math.round((maxLat - minLat) * scale);
const project = ([lon, lat]) => [
  Math.round((lon - minLon) * kx * scale * Q),
  Math.round((maxLat - lat) * scale * Q),
];
const key = ([x, y]) => `${x},${y}`;

const areaOf = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i += 1) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2) / (Q * Q);
};

// Rings per province, projected onto the grid, closed, without repeated points. Holes smaller than 12 square pixels
// (lakes and river mouths) go too; a larger hole, such as the National Capital District inside Central, is filled by
// its own province and stays.
const provinces = features.map((f) => ({
  code: f.properties.ADM1CD_c,
  name: f.properties.NAM_1,
  rings: polygonsOf(f.geometry).flatMap((poly) =>
    poly
      .map((ring) => {
        const pts = [];
        for (const p of ring.map(project)) if (!pts.length || key(pts.at(-1)) !== key(p)) pts.push(p);
        if (key(pts[0]) !== key(pts.at(-1))) pts.push(pts[0]);
        return pts;
      })
      .filter((ring, i) => ring.length >= 4 && areaOf(ring) >= (i > 0 ? 12 : MIN_AREA))
  ),
}));
const lost = provinces.filter((p) => p.rings.length === 0).map((p) => p.name);
if (lost.length) {
  console.error(`every shape of ${lost.join(", ")} is under --min-area ${MIN_AREA}; lower it`);
  process.exit(1);
}

// Junctions: points on two or more rings with more than two distinct neighbours among them, where a shared border
// begins or ends. A ring that only touches itself (a river mouth folded onto one grid point) is no junction: no other
// ring shares that stretch, so nothing there needs cutting.
const neighbours = new Map();
const ringsAt = new Map();
let ringId = 0;
for (const { rings } of provinces)
  for (const ring of rings) {
    ringId += 1;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const here = key(ring[i]);
      const prev = key(ring[i === 0 ? ring.length - 2 : i - 1]);
      const next = key(ring[i + 1]);
      if (!neighbours.has(here)) neighbours.set(here, new Set());
      if (!ringsAt.has(here)) ringsAt.set(here, new Set());
      neighbours.get(here).add(prev).add(next);
      ringsAt.get(here).add(ringId);
    }
  }
const isJunction = (p) => ringsAt.get(key(p)).size > 1 && neighbours.get(key(p)).size > 2;

// Arcs, stored once each: a ring is cut at its junctions; a ring with none is one closed arc.
const arcs = [];
const arcIndex = new Map();
function arcRef(points) {
  const forward = points.map(key).join(";");
  const backward = [...points].reverse().map(key).join(";");
  if (arcIndex.has(forward)) return { arc: arcIndex.get(forward), reversed: false };
  if (arcIndex.has(backward)) return { arc: arcIndex.get(backward), reversed: true };
  arcIndex.set(forward, arcs.length);
  arcs.push({ points, uses: 0 });
  return { arc: arcs.length - 1, reversed: false };
}
function closedArcRef(ring) {
  // A closed ring with no junction is matched in any rotation and either direction: start it at its smallest point.
  const open = ring.slice(0, -1);
  const keys = open.map(key);
  const start = keys.indexOf([...keys].sort()[0]);
  const rotated = [...open.slice(start), ...open.slice(0, start)];
  return arcRef([...rotated, rotated[0]]);
}
for (const province of provinces)
  province.parts = province.rings.map((ring) => {
    const cuts = ring.slice(0, -1).flatMap((p, i) => (isJunction(p) ? [i] : []));
    if (!cuts.length) return [closedArcRef(ring)];
    const refs = [];
    const open = ring.slice(0, -1);
    for (let c = 0; c < cuts.length; c += 1) {
      const from = cuts[c];
      const to = cuts[(c + 1) % cuts.length];
      const pts = [];
      for (let i = from; ; i = (i + 1) % open.length) {
        pts.push(open[i]);
        if (i === to && pts.length > 1) break;
      }
      refs.push(arcRef(pts));
    }
    return refs;
  });
for (const province of provinces)
  for (const ring of province.parts) for (const ref of ring) arcs[ref.arc].uses += 1;

// Douglas-Peucker on each arc, ends fixed.
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const d =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance * Q) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
for (const arc of arcs) {
  // A closed arc keeps its farthest point as a second anchor, so it cannot collapse to a line.
  if (key(arc.points[0]) === key(arc.points.at(-1)) && arc.points.length > 3) {
    const [x0, y0] = arc.points[0];
    let far = 1;
    arc.points.forEach(([x, y], i) => {
      if (Math.hypot(x - x0, y - y0) > Math.hypot(arc.points[far][0] - x0, arc.points[far][1] - y0)) far = i;
    });
    arc.simple = [
      ...simplify(arc.points.slice(0, far + 1), TOLERANCE),
      ...simplify(arc.points.slice(far), TOLERANCE).slice(1),
    ];
  } else arc.simple = simplify(arc.points, TOLERANCE);
}

const px = ([x, y]) => `${Math.round(x / Q)},${Math.round(y / Q)}`;
const dedupe = (pts) => pts.filter((p, i) => i === 0 || px(p) !== px(pts[i - 1]));
function ringPath(refs) {
  const pts = [];
  for (const { arc, reversed } of refs) {
    const seq = reversed ? [...arcs[arc].simple].reverse() : arcs[arc].simple;
    pts.push(...(pts.length ? seq.slice(1) : seq));
  }
  const clean = dedupe(pts);
  if (clean.length < 4) return "";
  return `M${clean.slice(0, -1).map(px).join("L")}Z`;
}
const linePath = (pts) => {
  const clean = dedupe(pts);
  return clean.length < 2 ? "" : `M${clean.map(px).join("L")}`;
};

const drawn = provinces.map((p) => ({ ...p, d: p.parts.map(ringPath).join("") }));
const empty = drawn.filter((p) => !p.d).map((p) => p.name);
if (empty.length) {
  console.error(`${empty.join(", ")} simplified to nothing; lower --tolerance`);
  process.exit(1);
}
const inner = arcs
  .filter((a) => a.uses >= 2)
  .map((a) => linePath(a.simple))
  .join("");
const attr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The projection, so a test can place a known town and check that it falls inside its own province's path:
// x = (longitude - west) * kx * scale, y = (north - latitude) * scale.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" data-west="${minLon}" data-north="${maxLat}" data-kx="${kx}" data-scale="${scale}">
<g fill="#dde4ef" fill-rule="evenodd">
${drawn.map((p) => `<path id="${attr(p.code)}" data-name="${attr(p.name)}" d="${p.d}"/>`).join("\n")}
</g>
<path fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" d="${inner}"/>
</svg>
`;
writeFileSync(out, svg);
const shared = arcs.filter((a) => a.uses >= 2).length;
console.log(
  `${out}: ${WIDTH}x${HEIGHT}, ${drawn.length} provinces, ${arcs.length} arcs (${shared} shared), ` +
    `${arcs.reduce((n, a) => n + a.simple.length, 0)} points, ${svg.length} bytes`
);
