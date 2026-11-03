import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

/**
 * The script a browser fetches before the workspace can show a school, measured on the build that ships
 * (`npm run build`). `/screening` is prerendered, so its HTML names every chunk the page loads up front: the async
 * script tags, the preloads and the chunks the hydration data lists. A chunk under a `noModule` tag is the legacy
 * polyfill, which no browser that runs the app fetches. Chunks the page imports later (the map, the guides, the
 * method details) are not named, so they cost nothing here.
 *
 * The budget is the measured size with a little room: 220.5 KiB gzip in 11 chunks on 3 November 2026. A change that
 * adds about 10 KiB of compressed script to the first load fails the check. On a 750 kbps phone connection each
 * 10 KiB is about a tenth of a second before the first school shows.
 */
const budgetBytes = 230 * 1024;
const dist = process.env.NEXT_DIST_DIR || ".next";
const routes = { "/screening": `${dist}/server/app/screening.html` };
// The map's libraries, by a string only they hold. They must stay out of the first load: each is larger than the
// whole budget's headroom, and on a phone the List shows no map until Map is chosen.
const MAP_MARKERS = { "maplibre-gl": "maplibregl-boxzoom", "deck.gl": "deck.gl" };

function chunksOf(html) {
  const legacy = new Set(
    [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*\bnoModule\b[^>]*>/g)].map((match) => match[1])
  );
  const named = html.match(/\/_next\/static\/chunks\/[\w.~-]+\.js/g) ?? [];
  return [...new Set(named)].filter((chunk) => !legacy.has(chunk));
}

const report = {};
for (const [route, file] of Object.entries(routes)) {
  const chunks = chunksOf(readFileSync(file, "utf8"));
  if (!chunks.length)
    throw new Error(`${file} names no script chunks; is this the output of \`npm run build\`?`);
  let bytes = 0;
  for (const chunk of chunks) {
    const source = readFileSync(`${dist}/${chunk.replace(/^\/_next\//, "")}`);
    for (const [library, marker] of Object.entries(MAP_MARKERS)) {
      if (source.includes(marker)) throw new Error(`${route} loads ${library} up front, in ${chunk}.`);
    }
    bytes += gzipSync(source).byteLength;
  }
  report[route] = { gzipBytes: bytes, budgetBytes, chunks: chunks.length };
  if (bytes > budgetBytes) {
    throw new Error(
      `${route} loads ${bytes} gzip bytes of script up front, above the ${budgetBytes} byte budget.`
    );
  }
}

writeFileSync(`${dist}/bundle-budget.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const [route, result] of Object.entries(report)) {
  console.log(
    `${route}: ${(result.gzipBytes / 1024).toFixed(1)} KiB gzip up front (${result.chunks} chunks), budget ${(result.budgetBytes / 1024).toFixed(0)} KiB`
  );
}
