import type {
  DistrictRecord,
  IndicatorsResponse,
  LayersResponse,
  RasterMetadataResponse,
  ScenarioRecord,
  ScoringRunResponse,
  SchoolRecord,
  VectorLayerFeaturesResponse,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function fetchIndicators(): Promise<IndicatorsResponse> {
  return apiFetch<IndicatorsResponse>("/api/v1/meta/indicators");
}

export async function fetchLayers(): Promise<LayersResponse[]> {
  return apiFetch<LayersResponse[]>("/api/v1/meta/layers");
}

export async function fetchDistrictOptions(): Promise<Array<{ district_id: string; province: string; district: string }>> {
  return apiFetch<Array<{ district_id: string; province: string; district: string }>>("/api/v1/meta/districts");
}

export async function fetchLayerFeatures(params: {
  layerKey: string;
  province?: string;
  district?: string;
  limit?: number;
  bbox4326?: [number, number, number, number];
}): Promise<VectorLayerFeaturesResponse> {
  const search = new URLSearchParams();
  if (params.province) search.set("province", params.province);
  if (params.district) search.set("district", params.district);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.bbox4326) {
    search.set("min_lon", String(params.bbox4326[0]));
    search.set("min_lat", String(params.bbox4326[1]));
    search.set("max_lon", String(params.bbox4326[2]));
    search.set("max_lat", String(params.bbox4326[3]));
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiFetch<VectorLayerFeaturesResponse>(`/api/v1/meta/layers/${params.layerKey}/features${suffix}`);
}

export async function fetchRasterMetadata(params: {
  layer: "flood" | "landcover" | "luminosity" | "elevation";
  district: string;
  province?: string;
  opacity?: number;
}): Promise<RasterMetadataResponse> {
  const search = new URLSearchParams();
  search.set("district", params.district);
  if (params.province) search.set("province", params.province);
  if (params.opacity != null) search.set("opacity", String(params.opacity));
  return apiFetch<RasterMetadataResponse>(`/api/v1/rasters/${params.layer}/metadata?${search.toString()}`);
}

export function buildRasterOverlayUrl(params: {
  layer: "flood" | "landcover" | "luminosity" | "elevation";
  district: string;
  province?: string;
  opacity?: number;
  format?: "png" | "geotiff";
}): string {
  const search = new URLSearchParams();
  search.set("district", params.district);
  if (params.province) search.set("province", params.province);
  if (params.opacity != null) search.set("opacity", String(params.opacity));
  if (params.format) search.set("format", params.format);
  return `${API_BASE_URL}/api/v1/rasters/${params.layer}/overlay?${search.toString()}`;
}

export async function fetchSchools(params: {
  district?: string;
  province?: string;
  scenarioId?: string;
  limit?: number;
}): Promise<SchoolRecord[]> {
  const search = new URLSearchParams();
  if (params.district) search.set("district", params.district);
  if (params.province) search.set("province", params.province);
  if (params.scenarioId) search.set("scenario_id", params.scenarioId);
  if (params.limit) search.set("limit", String(params.limit));
  return apiFetch<SchoolRecord[]>(`/api/v1/schools?${search.toString()}`);
}

export async function fetchSchoolDetail(schoolId: string, scenarioId?: string): Promise<SchoolRecord & Record<string, unknown>> {
  const search = new URLSearchParams();
  if (scenarioId) search.set("scenario_id", scenarioId);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiFetch<SchoolRecord & Record<string, unknown>>(`/api/v1/schools/${schoolId}${suffix}`);
}

export async function fetchDistrictChoropleth(params: {
  indicator?: string;
  province?: string;
  district?: string;
}): Promise<{ default_indicator: string; selected_indicator: string; features: DistrictRecord[] }> {
  const search = new URLSearchParams();
  if (params.indicator) search.set("indicator", params.indicator);
  if (params.province) search.set("province", params.province);
  if (params.district) search.set("district", params.district);
  return apiFetch<{ default_indicator: string; selected_indicator: string; features: DistrictRecord[] }>(
    `/api/v1/districts/choropleth?${search.toString()}`
  );
}

export async function fetchScenarios(): Promise<ScenarioRecord[]> {
  return apiFetch<ScenarioRecord[]>("/api/v1/scenarios");
}

export async function runScenario(payload: {
  scenario_name: string;
  description?: string;
  weight_overrides?: Record<string, unknown>;
  config_overrides?: Record<string, unknown>;
  persist?: boolean;
  created_by?: string;
  is_default?: boolean;
}): Promise<ScoringRunResponse> {
  return apiFetch<ScoringRunResponse>("/api/v1/scoring/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
