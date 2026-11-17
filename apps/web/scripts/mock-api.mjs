import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CI_MOCK_API_PORT ?? 4100);
// Screening responses come from e2e/fixtures/screening, which services/api/scripts/generate_screening_fixtures.py
// saved from the real API. Only a request that was captured is answered; any other screening request fails loudly,
// so a test cannot pass on a response the API never gave (for example a filter the fixtures do not cover).
//
// The folder holds several datasets: the default one in the folder itself and one per subfolder with an index.json
// ("worst-names", "ties-and-ranges", "one", "empty"). A test picks one for its own requests, so tests that run in
// parallel never share a choice:
//   cookie  mock-screening-dataset=worst-names           or header  x-mock-screening-dataset: worst-names
//   cookie  mock-screening-fail=results:503|inputs:500   or header  x-mock-screening-fail: results:503
// A failure names the first path segment after /api/v1/screening/ (rules, results, inputs, schools, compare, exports) and
// the status to answer with; the body has the API's error envelope shape. A fixture saved with a status of its
// own (the 404 of the empty dataset) is answered with that status.
const screeningDir = fileURLToPath(new URL("../e2e/fixtures/screening/", import.meta.url));
const DEFAULT_DATASET = "default";
const screeningDatasets = new Map([
  [DEFAULT_DATASET, { dir: screeningDir, requests: readIndex(screeningDir) }],
]);
for (const entry of readdirSync(screeningDir, { withFileTypes: true })) {
  const dir = `${screeningDir}${entry.name}/`;
  if (entry.isDirectory() && existsSync(`${dir}index.json`)) {
    screeningDatasets.set(entry.name, { dir, requests: readIndex(dir) });
  }
}
const sameQuery = (a, b) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

function readIndex(dir) {
  return JSON.parse(readFileSync(`${dir}index.json`, "utf8")).requests;
}

function cookieValue(request, name) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

const choice = (request, name) => request.headers[`x-${name}`] ?? cookieValue(request, name);

function screeningFixture(dataset, url) {
  const path = decodeURIComponent(url.pathname);
  const query = Object.fromEntries(url.searchParams);
  return dataset.requests.find(
    (entry) => decodeURIComponent(entry.path) === path && sameQuery(entry.query, query)
  );
}

function screeningFailure(request, url) {
  const route = url.pathname.split("/")[4];
  const wanted = String(choice(request, "mock-screening-fail") ?? "")
    .split("|")
    .map((item) => item.split(":"))
    .find(([name]) => name === route);
  return wanted ? Number(wanted[1]) : undefined;
}

function answerScreening(request, response, url) {
  const name = choice(request, "mock-screening-dataset") || DEFAULT_DATASET;
  const dataset = screeningDatasets.get(name);
  if (!dataset) {
    const known = [...screeningDatasets.keys()].join(", ");
    const message = `No fixture dataset ${name}; known: ${known}`;
    return json(response, { error: { code: "fixture_dataset_unknown", message } }, 501);
  }
  const failure = screeningFailure(request, url);
  if (failure !== undefined) {
    const message = `The mock was asked to answer ${failure}`;
    return json(response, { error: { code: "mock_failure", message } }, failure);
  }
  const entry = screeningFixture(dataset, url);
  if (!entry) {
    const message = `No saved response for ${request.url}`;
    return json(response, { error: { code: "fixture_not_captured", message } }, 501);
  }
  // A download (the top list's CSV) carries the headers the API sent with it; everything else is the API's JSON.
  response.writeHead(
    entry.status ?? 200,
    entry.headers ?? { "Content-Type": "application/json", "Cache-Control": "no-store" }
  );
  return response.end(readFileSync(`${dataset.dir}${entry.file}`));
}

function json(response, value, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function route(request, response) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/healthz") return json(response, { status: "ok" });
  if (url.pathname === "/api/v1/test/basemap-style.json") {
    // A tile-less basemap, so the browser tests never depend on CARTO.
    return json(response, {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": "#ece9e2" } }],
    });
  }
  if (url.pathname.startsWith("/api/v1/screening/")) return answerScreening(request, response, url);
  return json(response, { error: "Not found" }, 404);
}

const server = createServer((request, response) => {
  void route(request, response).catch((error) => {
    console.error(error);
    json(response, { error: "Fixture request failed" }, 500);
  });
});
server.listen(port, "127.0.0.1", () => console.log(`MOCK_API_READY ${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
