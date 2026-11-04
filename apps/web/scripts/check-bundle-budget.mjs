import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

/**
 * The script a browser fetches before a page can show its content, measured on the build that ships
 * (`npm run build`). Both pages are prerendered, so each HTML names every chunk the page loads up front: the async
 * script tags, the preloads and the chunks the hydration data lists. A chunk under a `noModule` tag is the legacy
 * polyfill, which no browser that runs the app fetches. Chunks a page imports later (the workspace's map, guides and
 * method details) are not named, so they cost nothing here. A page that is not prerendered has no HTML here, and the
 * check fails on it.
 *
 * Each budget is the measured size with a little room. `/screening`: 220.5 KiB gzip in 11 chunks on 3 November 2026;
 * a change that adds about 10 KiB of compressed script to the first load fails the check. On a 750 kbps phone
 * connection each 10 KiB is about a tenth of a second before the first school shows. `/`, the homepage, is server
 * markup with no script of its own: 132.1 KiB gzip in 5 chunks on 3 November 2026, all of it the framework's
 * runtime. Its budget leaves less room than a library such as React Query (11 KiB) takes, so one cannot arrive
 * with a change unnoticed.
 */
const dist = process.env.NEXT_DIST_DIR || ".next";
const routes = {
  "/screening": { file: `${dist}/server/app/screening.html`, budgetBytes: 230 * 1024 },
  "/": { file: `${dist}/server/app/index.html`, budgetBytes: 138 * 1024 },
};
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
for (const [route, { file, budgetBytes }] of Object.entries(routes)) {
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
