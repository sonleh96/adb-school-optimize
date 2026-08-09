import { useQuery } from "@tanstack/react-query";

import {
  fetchDistrictChoropleth,
  fetchDistrictOptions,
  fetchIndicators,
  fetchSchoolDetail,
  fetchSchools,
  fetchScenarios,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useScenariosQuery() {
  return useQuery({
    queryKey: queryKeys.scenarios,
    queryFn: fetchScenarios,
  });
}

export function useSchoolsQuery(
  params: {
    district?: string;
    province?: string;
    scenarioId?: string;
    limit?: number;
  } = {}
) {
  const limit = params.limit ?? 10000;
  return useQuery({
    queryKey: queryKeys.schools({
      district: params.district,
      province: params.province,
      scenarioId: params.scenarioId,
      limit,
    }),
    queryFn: () =>
      fetchSchools({
        district: params.district,
        province: params.province,
        scenarioId: params.scenarioId,
        limit,
      }),
  });
}

export function useSchoolDetailQuery(schoolId: string | null, scenarioId?: string) {
  return useQuery({
    queryKey: queryKeys.schoolDetail(schoolId ?? "", scenarioId),
    queryFn: () => fetchSchoolDetail(schoolId!, scenarioId),
    enabled: Boolean(schoolId),
  });
}

export function useDistrictOptionsQuery() {
  return useQuery({
    queryKey: queryKeys.districts,
    queryFn: fetchDistrictOptions,
  });
}

export function useIndicatorsQuery() {
  return useQuery({
    queryKey: queryKeys.indicators,
    queryFn: fetchIndicators,
  });
}

export function useChoroplethQuery(
  params: {
    indicator?: string;
    province?: string;
    district?: string;
    fields?: "scores" | "indicator" | "full";
  } = {}
) {
  return useQuery({
    queryKey: queryKeys.choropleth(params),
    queryFn: () => fetchDistrictChoropleth(params),
  });
}
