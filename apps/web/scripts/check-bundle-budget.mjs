import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const budgetBytes = 250 * 1024;
const routes = [
  "/all-schools/page",
  "/school-explorer/page",
  "/district-explorer/page",
  "/scenario-lab/page",
  "/methodology-lab/page",
];
const report = {};

function routeChunks(route) {
  if (existsSync(".next/app-build-manifest.json")) {
    const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
    return manifest.pages[route] ?? [];
  }

  const manifestPath = `.next/server/app${route.replace(/\/page$/, "/page_client-reference-manifest.js")}`;
  const source = readFileSync(manifestPath, "utf8");
  const entry = source.indexOf("globalThis.__RSC_MANIFEST[");
  const assignment = source.indexOf("=", entry);
  if (assignment < 0) throw new Error(`Could not parse ${manifestPath}.`);
  const manifest = JSON.parse(source.slice(assignment + 1).replace(/;\s*$/, ""));
  return Object.values(manifest.clientModules).flatMap((module) => module.chunks ?? []);
}

for (const route of routes) {
  const chunks = [...new Set(routeChunks(route))]
    .map((file) => file.replace(/^\/_next\//, ""))
    .filter((file) => file.endsWith(".js"));
  if (!chunks.length) throw new Error(`Bundle manifest is missing ${route}.`);
  const bytes = chunks.reduce((sum, chunk) => {
    const path = `.next/${chunk}`;
    statSync(path);
    return sum + gzipSync(readFileSync(path)).byteLength;
  }, 0);
  report[route.replace(/\/page$/, "")] = { gzipBytes: bytes, budgetBytes, chunks: chunks.length };
  if (bytes > budgetBytes) {
    throw new Error(`${route} is ${bytes} gzip bytes, above the ${budgetBytes} byte budget.`);
  }
}

writeFileSync(".next/bundle-budget.json", `${JSON.stringify(report, null, 2)}\n`);
for (const [route, result] of Object.entries(report)) {
  console.log(`${route}: ${(result.gzipBytes / 1024).toFixed(1)} KiB gzip (${result.chunks} chunks)`);
}
