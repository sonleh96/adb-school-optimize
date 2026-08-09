import type {
  DistrictRecord,
  IndicatorsResponse,
  LayersResponse,
  RasterMetadataResponse,
  ScenarioRecord,
  SchoolRecord,
  VectorLayerFeaturesResponse,
} from "@/lib/types";

export const queryKeys = {
  indicators: ["indicators"] as const,
  layers: ["layers"] as const,
  districts: ["districts"] as const,
  schools: (params: {
    district?: string;
    province?: string;
    scenarioId?: string;
    limit?: number;
  } = {}) => ["schools", params] as const,
  schoolDetail: (schoolId: string, scenarioId?: string) =>
    ["school-detail", schoolId, scenarioId ?? null] as const,
  choropleth: (
    params: {
      indicator?: string;
      province?: string;
      district?: string;
      fields?: "scores" | "indicator" | "full";
    } = {},
  ) => ["choropleth", params] as const,
  scenarios: ["scenarios"] as const,
  layerFeatures: (params: {
    layerKey: string;
    province?: string;
    district?: string;
    limit?: number;
    bbox4326?: [number, number, number, number];
  }) => ["layer-features", params] as const,
  rasterMetadata: (params: {
    layer: "flood" | "landcover" | "luminosity" | "elevation";
    district: string;
    province?: string;
    opacity?: number;
  }) => ["raster-metadata", params] as const,
};

export type {
  DistrictRecord,
  IndicatorsResponse,
  LayersResponse,
  RasterMetadataResponse,
  ScenarioRecord,
  SchoolRecord,
  VectorLayerFeaturesResponse,
};
