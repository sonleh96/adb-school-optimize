import { createServer } from "node:http";

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
