import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSchools } from "@/lib/api";
import { useSchoolsQuery } from "@/lib/hooks";

vi.mock("@/lib/api", () => ({
  fetchSchools: vi.fn(),
  fetchScenarios: vi.fn(),
  fetchSchoolDetail: vi.fn(),
  fetchDistrictOptions: vi.fn(),
  fetchIndicators: vi.fn(),
  fetchDistrictChoropleth: vi.fn(),
}));

const mockedFetchSchools = vi.mocked(fetchSchools);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useSchoolsQuery", () => {
  beforeEach(() => mockedFetchSchools.mockReset());

  it("does not request schools while the query is disabled", () => {
    renderHook(() => useSchoolsQuery({ enabled: false, scenarioId: "scenario-1" }), { wrapper });
    expect(mockedFetchSchools).not.toHaveBeenCalled();
  });

  it("forwards bounded query inputs and exposes the result", async () => {
    mockedFetchSchools.mockResolvedValue([
      {
        school_id: "one",
        school_name: "Demo",
        province: "NCD",
        district: "National Capital District",
        latitude: -9.44,
        longitude: 147.18,
      },
    ]);
    const { result } = renderHook(
      () => useSchoolsQuery({ province: "NCD", scenarioId: "scenario-1", limit: 50 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedFetchSchools).toHaveBeenCalledWith({
      province: "NCD",
      district: undefined,
      scenarioId: "scenario-1",
      limit: 50,
    });
    expect(result.current.data?.[0].school_name).toBe("Demo");
  });
});
