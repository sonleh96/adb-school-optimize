import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CI_MOCK_API_PORT ?? 4100);
let scenario = {
  scenario_id: "scenario-1",
  scenario_name: "Reference scenario",
  description: "Stable CI fixture",
  weights: { need: { S: 0.55, A: 0.25, R_phys: 0.2 }, priority: { Need: 0.7, I: 0.2, P: 0.1 } },
  config: {},
  is_default: true,
  updated_at: "2026-08-10T00:00:00Z",
};
const schools = [
  {
    school_id: "school-1",
    school_name: "Port Moresby Secondary",
    locality: "Port Moresby",
    province: "National Capital District",
    district: "National Capital District",
    latitude: -9.44,
    longitude: 147.18,
    priority: 0.82,
    need: 0.74,
    data_confidence: 0.92,
    stage1_selected: true,
    rank_priority: 1,
    rank_need: 2,
  },
  {
    school_id: "school-2",
    school_name: "Lae Secondary",
    locality: "Lae",
    province: "Morobe",
    district: "Lae",
    latitude: -6.73,
    longitude: 147.0,
    priority: 0.66,
    need: 0.79,
    data_confidence: 0.85,
    stage1_selected: false,
    rank_priority: 2,
    rank_need: 1,
  },
];
const districtFeatures = [
  {
    district_id: "district-1",
    province: "National Capital District",
    district: "National Capital District",
    priority: 0.81,
    need: 0.73,
    average_aqi: 54,
    conflict_events: 3,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [146.9, -9.6],
          [147.35, -9.6],
          [147.35, -9.25],
          [146.9, -9.25],
          [146.9, -9.6],
        ],
      ],
    },
  },
  {
    district_id: "district-2",
    province: "Morobe",
    district: "Lae",
    priority: 0.64,
    need: 0.78,
    average_aqi: 38,
    conflict_events: 1,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [146.75, -6.9],
          [147.2, -6.9],
          [147.2, -6.5],
          [146.75, -6.5],
          [146.75, -6.9],
        ],
      ],
    },
  },
];

// Screening responses come from e2e/fixtures/screening, which services/api/scripts/generate_screening_fixtures.py
// saved from the real API. Only a request that was captured is answered; any other screening request fails loudly,
// so a test cannot pass on a response the API never gave (for example a filter the fixtures do not cover).
//
// The folder holds several datasets: the default one in the folder itself and one per subfolder with an index.json
// ("worst-names", "ties-and-ranges", "one", "empty"). A test picks one for its own requests, so tests that run in
// parallel never share a choice:
//   cookie  mock-screening-dataset=worst-names           or header  x-mock-screening-dataset: worst-names
//   cookie  mock-screening-fail=results:503|inputs:500   or header  x-mock-screening-fail: results:503
// A failure names the first path segment after /api/v1/screening/ (rules, results, inputs, schools, compare) and
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
  response.writeHead(entry.status ?? 200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  return response.end(readFileSync(`${dataset.dir}${entry.file}`));
}

function json(response, value, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
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
  if (url.pathname === "/api/v1/meta/indicators") {
    return json(response, { default: "Average AQI", items: ["Average AQI", "Conflict Events"] });
  }
  if (url.pathname === "/api/v1/meta/districts") {
    return json(
      response,
      districtFeatures.map(({ district_id, province, district }) => ({ district_id, province, district }))
    );
  }
  if (url.pathname === "/api/v1/meta/layers") return json(response, []);
  if (url.pathname === "/api/v1/scenarios") return json(response, [scenario]);
  if (url.pathname === "/api/v1/scoring/run" && request.method === "POST") {
    const payload = await readJson(request);
    scenario = {
      ...scenario,
      scenario_name:
        typeof payload.scenario_name === "string" && payload.scenario_name.trim()
          ? payload.scenario_name.trim()
          : scenario.scenario_name,
      description:
        typeof payload.description === "string" ? payload.description.trim() : scenario.description,
      weights:
        payload.weight_overrides && typeof payload.weight_overrides === "object"
          ? payload.weight_overrides
          : scenario.weights,
      updated_at: new Date().toISOString(),
    };
    return json(response, {
      scenario,
      summary: { count: schools.length },
      run_manifest: {},
      warnings: [],
      top_rows: schools,
    });
  }
  if (url.pathname === "/api/v1/schools") return json(response, schools);
  if (url.pathname.startsWith("/api/v1/schools/")) {
    return json(response, schools.find((school) => url.pathname.endsWith(school.school_id)) ?? schools[0]);
  }
  if (url.pathname === "/api/v1/districts/choropleth") {
    return json(response, {
      default_indicator: "Average AQI",
      selected_indicator: url.searchParams.get("indicator") ?? "Average AQI",
      fields: url.searchParams.get("fields") ?? "indicator",
      features: districtFeatures,
    });
  }
  if (url.pathname.startsWith("/api/v1/exports/")) {
    const filename = url.pathname.split("/").at(-1) ?? "export.xlsx";
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="research_prototype_${filename}"`,
    });
    return response.end(Buffer.from("CI export fixture"));
  }
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
