"use client";

import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CONFIDENCE_BAND_LABELS,
  EMPTY_SCHOOL_FILTERS,
  hasActiveSchoolFilters,
  type SchoolFilters,
} from "@/lib/schoolFilters";

const SCORE_THRESHOLDS = [0, 0.25, 0.5, 0.75] as const;

function scoreLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function filterLabel(filters: SchoolFilters, key: keyof SchoolFilters): string | null {
  if (key === "minPriority" && filters.minPriority != null)
    return `Priority ≥ ${scoreLabel(filters.minPriority)}`;
  if (key === "minNeed" && filters.minNeed != null) return `Need ≥ ${scoreLabel(filters.minNeed)}`;
  if (key === "provinces" && filters.provinces.length) {
    return filters.provinces.length === 1 ? filters.provinces[0] : `${filters.provinces.length} provinces`;
  }
  if (key === "stage1Only" && filters.stage1Only) return "Stage 1 only";
  if (key === "confidence" && filters.confidence)
    return `Confidence: ${CONFIDENCE_BAND_LABELS[filters.confidence]}`;
  return null;
}

export function SchoolFilterControls({
  filters,
  provinces,
  resultCount,
  onChange,
}: {
  filters: SchoolFilters;
  provinces: readonly string[];
  resultCount: number;
  onChange: (filters: SchoolFilters) => void;
}) {
  const active = hasActiveSchoolFilters(filters);
  const activeKeys = (["minPriority", "minNeed", "provinces", "stage1Only", "confidence"] as const).filter(
    (key) => filterLabel(filters, key)
  );
  const removeFilter = (key: keyof SchoolFilters) => {
    if (key === "minPriority" || key === "minNeed" || key === "confidence")
      onChange({ ...filters, [key]: null });
    if (key === "provinces") onChange({ ...filters, provinces: [] });
    if (key === "stage1Only") onChange({ ...filters, stage1Only: false });
  };

  return (
    <section className="border-b border-[var(--color-line)] px-3 py-2" aria-label="School filters">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
          <SlidersHorizontal className="size-3.5" aria-hidden /> Filters
        </p>
        <p className="text-xs text-[var(--color-muted)]" role="status" aria-live="polite">
          {resultCount} {resultCount === 1 ? "school" : "schools"}
        </p>
      </div>

      {active ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {activeKeys.map((key) => {
            const label = filterLabel(filters, key);
            if (!label) return null;
            return (
              <button
                key={key}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-brand-2)] bg-[rgba(0,108,183,0.08)] px-2 py-1 text-xs font-medium text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-2)]"
                onClick={() => removeFilter(key)}
                aria-label={`Remove ${label} filter`}
              >
                {label}
                <X className="size-3" aria-hidden />
              </button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5"
            onClick={() => onChange(EMPTY_SCHOOL_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <details className="mt-2 group">
        <summary className="cursor-pointer text-xs font-medium text-[var(--color-brand-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-2)]">
          {active ? "Adjust filters" : "Add filters"}
        </summary>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-[var(--color-ink)]">
            Minimum Priority
            <select
              className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-strong)] px-2 text-xs"
              value={filters.minPriority ?? ""}
              onChange={(event) =>
                onChange({
                  ...filters,
                  minPriority: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            >
              <option value="">Any score</option>
              {SCORE_THRESHOLDS.map((value) => (
                <option key={value} value={value}>
                  {scoreLabel(value)} or higher
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-ink)]">
            Minimum Need
            <select
              className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-strong)] px-2 text-xs"
              value={filters.minNeed ?? ""}
              onChange={(event) =>
                onChange({
                  ...filters,
                  minNeed: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            >
              <option value="">Any score</option>
              {SCORE_THRESHOLDS.map((value) => (
                <option key={value} value={value}>
                  {scoreLabel(value)} or higher
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-1 text-xs font-medium text-[var(--color-ink)]">
            <legend>Provinces</legend>
            <div className="grid max-h-36 grid-cols-2 gap-x-2 gap-y-1 overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface-strong)] p-2">
              {provinces.map((province) => {
                const checked = filters.provinces.includes(province);
                return (
                  <label key={province} className="flex min-w-0 items-center gap-1.5 font-normal">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          ...filters,
                          provinces: checked
                            ? filters.provinces.filter((item) => item !== province)
                            : [...filters.provinces, province],
                        })
                      }
                    />
                    <span className="truncate" title={province}>
                      {province}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={filters.stage1Only}
              onChange={(event) => onChange({ ...filters, stage1Only: event.target.checked })}
            />
            Stage 1 screening only
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-ink)]">
            Data confidence
            <select
              className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-strong)] px-2 text-xs"
              value={filters.confidence ?? ""}
              onChange={(event) =>
                onChange({
                  ...filters,
                  confidence:
                    event.target.value === "" ? null : (event.target.value as SchoolFilters["confidence"]),
                })
              }
            >
              <option value="">Any confidence</option>
              <option value="high">High: 90%+ core inputs present</option>
              <option value="moderate">Moderate: 70-89% present</option>
              <option value="limited">Limited: under 70% present</option>
            </select>
          </label>
        </div>
      </details>
    </section>
  );
}
