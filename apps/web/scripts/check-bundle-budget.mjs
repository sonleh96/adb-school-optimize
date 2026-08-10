import { readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const budgetBytes = 250 * 1024;
const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
const routes = [
  "/all-schools/page",
  "/school-explorer/page",
  "/district-explorer/page",
  "/scenario-lab/page",
  "/methodology-lab/page",
];
const report = {};

for (const route of routes) {
  const chunks = [...new Set(manifest.pages[route] ?? [])].filter((file) => file.endsWith(".js"));
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
