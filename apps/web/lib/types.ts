export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

export type SchoolRecord = {
  school_id?: string;
  school_name: string;
  locality?: string | null;
  province: string;
  district: string;
  latitude: number;
  longitude: number;
  geometry?: GeoJsonGeometry | null;
  scenario_id?: string | null;
  s?: number | null;
  a?: number | null;
  r_phys?: number | null;
  g?: number | null;
  i?: number | null;
  p?: number | null;
  need?: number | null;
  priority?: number | null;
  data_confidence?: number | null;
  stage1_selected?: boolean | null;
  rank_priority?: number | null;
  rank_need?: number | null;
};

export type DistrictRecord = {
  district_id: string;
  province: string;
  district: string;
  geometry: GeoJsonGeometry;
  average_aqi?: number | null;
  maximum_aqi?: number | null;
  fixed_broadband_download_speed_mbps?: number | null;
  fixed_broadband_upload_speed_mbps?: number | null;
  mobile_internet_download_speed_mbps?: number | null;
  mobile_internet_upload_speed_mbps?: number | null;
  access_walking_pct?: number | null;
  access_driving_pct?: number | null;
  access_cycling_pct?: number | null;
  total_nighttime_luminosity?: number | null;
  secondary_students_per_1000_people?: number | null;
  rate_grade_7_progressed_to_grade_10_pct?: number | null;
  conflict_events?: number | null;
  conflict_fatalities?: number | null;
  conflict_population_exposure?: number | null;
  [key: string]: unknown;
};

export type ScenarioRecord = {
  scenario_id: string;
  scenario_name: string;
  description?: string | null;
  weights: Record<string, unknown>;
  config?: Record<string, unknown> | null;
  created_by?: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LayersResponse = {
  layer_id: string;
  layer_key: string;
  layer_name: string;
  layer_group: string;
  layer_type: string;
  source_kind: string;
  default_visible: boolean;
  runtime_clip: boolean;
};

export type VectorLayerFeature = {
  vector_feature_id: string;
  layer_key: string;
  source_feature_id?: string | null;
  feature_name?: string | null;
  province?: string | null;
  district?: string | null;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

export type VectorLayerFeaturesResponse = {
  layer: LayersResponse;
  count: number;
  items: VectorLayerFeature[];
};

export type RasterMetadataResponse = {
  layer: string;
  district: string;
  province: string;
  opacity: number;
  bounds_4326: [number, number, number, number];
  source_uri: string;
  width: number;
  height: number;
  cache_status?: "hit" | "miss";
};

export type IndicatorsResponse = {
  default: string;
  items: string[];
};

export type ScoringRunResponse = {
  scenario: ScenarioRecord | null;
  summary: Record<string, unknown>;
  warnings: string[];
  top_rows: SchoolRecord[];
};
