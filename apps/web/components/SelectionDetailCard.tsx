"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { ArrowUpRight, Building2, MapPin, School } from "lucide-react";

import { ErrorState, LoadingSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  formatCount,
  formatDistrictIndicator,
  formatInteger,
  formatPercent,
  formatScore,
  formatScoreDelta,
  toFiniteNumber,
} from "@/lib/format";
import type { DistrictRecord, SchoolRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type SchoolDetail = SchoolRecord & Record<string, unknown>;

type CommonProps = {
  className?: string;
  scenarioId: string | null;
};

type SchoolSelectionDetailCardProps = CommonProps & {
  kind: "school";
  school: SchoolRecord | null;
  detail: SchoolDetail | null;
  schools: SchoolRecord[];
  isLoading: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  catchmentEnabled?: boolean;
  onCatchmentChange?: (enabled: boolean) => void;
};

type DistrictSelectionDetailCardProps = CommonProps & {
  kind: "district";
  district: DistrictRecord | null;
  districts: DistrictRecord[];
  indicator: string;
  indicatorField: string;
  isLoading: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

type SelectionDetailCardProps = SchoolSelectionDetailCardProps | DistrictSelectionDetailCardProps;

function median(values: unknown[]): number | null {
  const numbers = values
    .map(toFiniteNumber)
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function metricValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function scenarioLabHref({
  scenarioId,
  school,
  district,
  province,
}: {
  scenarioId: string | null;
  school?: string | null;
  district: string;
  province: string;
}) {
  const search = new URLSearchParams();
  if (scenarioId) search.set("scenario", scenarioId);
  if (school) search.set("school", school);
  search.set("district", district);
  search.set("province", province);
  return `/scenario-lab?${search.toString()}`;
}

function ScoreMetric({
  label,
  value,
  medianValue,
  medianLabel,
}: {
  label: string;
  value: unknown;
  medianValue: unknown;
  medianLabel: string;
}) {
  const comparison = formatScoreDelta(value, medianValue);
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-3">
      <dt className="text-xs font-medium text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
        {formatScore(value)}
      </dd>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {comparison === "n/a" ? "Median unavailable" : `${comparison} vs ${medianLabel}`}
      </p>
    </div>
  );
}

function DriverList({
  title,
  drivers,
}: {
  title: string;
  drivers: Array<{ label: string; value: unknown }>;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-drivers`}>
      <h3
        id={`${title.toLowerCase().replaceAll(" ", "-")}-drivers`}
        className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]"
      >
        {title}
      </h3>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {drivers.map((driver) => (
          <div key={driver.label} className="min-w-0 rounded-md border border-[var(--color-line)] px-2 py-2">
            <dt
              className="truncate text-[0.68rem] font-medium text-[var(--color-muted)]"
              title={driver.label}
            >
              {driver.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--color-ink)]">
              {formatScore(driver.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SchoolDetail({ props }: { props: SchoolSelectionDetailCardProps }) {
  const { school, detail, schools } = props;
  if (!school) return null;
  const districtSchools = schools.filter(
    (candidate) => candidate.district === school.district && candidate.province === school.province
  );
  const comparisonSchools = districtSchools.length > 1 ? districtSchools : schools;
  const medianLabel = districtSchools.length > 1 ? "district median" : "national median";
  const context = detail ?? school;

  return (
    <>
      <dl className="grid grid-cols-2 gap-2">
        <ScoreMetric
          label="Priority"
          value={school.priority}
          medianValue={median(comparisonSchools.map((candidate) => candidate.priority))}
          medianLabel={medianLabel}
        />
        <ScoreMetric
          label="Need"
          value={school.need}
          medianValue={median(comparisonSchools.map((candidate) => candidate.need))}
          medianLabel={medianLabel}
        />
      </dl>

      <DriverList
        title="Need drivers"
        drivers={[
          { label: "School need", value: school.s },
          { label: "Area disadvantage", value: school.a },
          { label: "Physical resilience", value: school.r_phys },
          { label: "Girls bonus", value: school.g },
        ]}
      />
      <DriverList
        title="Priority drivers"
        drivers={[
          { label: "Need", value: school.need },
          { label: "Impact potential", value: school.i },
          { label: "Practicality", value: school.p },
        ]}
      />

      {props.onCatchmentChange ? (
        <section
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-3"
          aria-labelledby="school-proximity-lens"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="school-proximity-lens" className="text-sm font-semibold text-[var(--color-ink)]">
                Catchment / proximity
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                Fixed straight-line rings: 4 km walk, 7 km cycle, and 10 km drive. These are not travel times
                or road-network routes.
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={props.catchmentEnabled ?? false}
                onChange={(event) => props.onCatchmentChange?.(event.target.checked)}
                aria-describedby="school-proximity-lens-copy"
              />
              Show
            </label>
          </div>
          <p id="school-proximity-lens-copy" className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
            {props.catchmentEnabled
              ? "Access context layers are on. Turning this off removes only the rings."
              : "Turning this on also enables the three access context layers."}
          </p>
        </section>
      ) : null}

      {props.isLoading ? <LoadingSkeleton lines={2} className="p-3" /> : null}
      {props.errorMessage ? (
        <ErrorState
          title="School details unavailable"
          message="The selected school’s supplementary attributes could not be loaded. Scores remain available."
          onRetry={props.onRetry}
          className="px-4 py-5"
        />
      ) : null}
      {!props.isLoading && !props.errorMessage ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--color-line)] pt-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--color-muted)]">Teachers</dt>
            <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
              {formatInteger(metricValue(context, "number_of_available_teachers"))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)]">Classrooms</dt>
            <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
              {formatInteger(metricValue(context, "total_number_of_classrooms"))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)]">Walking access</dt>
            <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
              {formatPercent(metricValue(context, "access_walking_pct"))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)]">Enrollment, grades 7-10</dt>
            <dd className="mt-0.5 font-medium text-[var(--color-ink)]">
              {formatCount(metricValue(context, "total_enrollment_grade_7_10"))}
            </dd>
          </div>
        </dl>
      ) : null}
    </>
  );
}

function DistrictDetail({ props }: { props: DistrictSelectionDetailCardProps }) {
  const { district, districts, indicator, indicatorField } = props;
  if (!district) return null;
  const indicatorMedian = median(districts.map((candidate) => metricValue(candidate, indicatorField)));
  const priorityMedian = median(districts.map((candidate) => candidate.priority));
  const needMedian = median(districts.map((candidate) => candidate.need));
  const selectedIndicator = metricValue(district, indicatorField);

  return (
    <>
      <section
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-3"
        aria-labelledby="selected-indicator"
      >
        <h3 id="selected-indicator" className="text-xs font-medium text-[var(--color-muted)]">
          {indicator}
        </h3>
        <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
          {formatDistrictIndicator(indicator, selectedIndicator)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {toFiniteNumber(selectedIndicator) == null || indicatorMedian == null
            ? "National median unavailable"
            : `${formatDistrictIndicator(indicator, selectedIndicator)} vs ${formatDistrictIndicator(
                indicator,
                indicatorMedian
              )} national median`}
        </p>
      </section>
      <dl className="grid grid-cols-2 gap-2">
        <ScoreMetric
          label="Priority"
          value={district.priority}
          medianValue={priorityMedian}
          medianLabel="national median"
        />
        <ScoreMetric
          label="Need"
          value={district.need}
          medianValue={needMedian}
          medianLabel="national median"
        />
      </dl>
      {props.isLoading ? <LoadingSkeleton lines={2} className="p-3" /> : null}
      {props.errorMessage ? (
        <ErrorState
          title="District details unavailable"
          message="The district data could not be loaded. Choose another district or retry."
          onRetry={props.onRetry}
          className="px-4 py-5"
        />
      ) : null}
    </>
  );
}

export function SelectionDetailCard(props: SelectionDetailCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasHandledInitialSelection = useRef(false);
  const selectionKey =
    props.kind === "school" ? (props.school?.school_id ?? null) : (props.district?.district_id ?? null);
  const selectionName = props.kind === "school" ? props.school?.school_name : props.district?.district;
  const location =
    props.kind === "school" && props.school
      ? `${props.school.district}, ${props.school.province}`
      : props.kind === "district" && props.district
        ? props.district.province
        : null;

  useEffect(() => {
    if (!selectionKey) return;
    if (!hasHandledInitialSelection.current) {
      hasHandledInitialSelection.current = true;
      return;
    }
    cardRef.current?.focus({ preventScroll: true });
  }, [selectionKey]);

  const scenarioHref = useMemo(() => {
    if (props.kind === "school" && props.school) {
      return scenarioLabHref({
        scenarioId: props.scenarioId,
        school: props.school.school_id,
        district: props.school.district,
        province: props.school.province,
      });
    }
    if (props.kind === "district" && props.district) {
      return scenarioLabHref({
        scenarioId: props.scenarioId,
        district: props.district.district,
        province: props.district.province,
      });
    }
    return null;
  }, [props]);

  const icon = props.kind === "school" ? School : Building2;
  const Icon = icon;

  return (
    <Card
      ref={cardRef}
      tabIndex={-1}
      className={cn(
        "overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-2)]",
        props.className
      )}
      aria-labelledby="selection-detail-title"
    >
      <CardHeader className="gap-2 p-4">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          <Icon className="size-3.5" aria-hidden />
          {props.kind === "school" ? "School selection" : "District selection"}
        </p>
        {selectionName ? (
          <div>
            <h2
              id="selection-detail-title"
              className="font-[family-name:var(--font-display)] text-base font-semibold leading-tight tracking-[-0.03em]"
            >
              {selectionName}
            </h2>
            {location ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-muted)]">
                <MapPin className="size-3" aria-hidden />
                {location}
              </p>
            ) : null}
          </div>
        ) : (
          <h2
            id="selection-detail-title"
            className="font-[family-name:var(--font-display)] text-base font-semibold tracking-[-0.03em]"
          >
            Selection details
          </h2>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {selectionName ? `${selectionName} selected.` : "No selection."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        {props.isLoading && !selectionKey ? <LoadingSkeleton lines={4} className="p-4" /> : null}
        {!props.isLoading && !selectionKey && !props.errorMessage ? (
          <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-6 text-center">
            <p className="m-0 text-sm font-medium text-[var(--color-ink)]">
              Choose a {props.kind === "school" ? "school" : "district"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Select it on the map or from the ranking to inspect its drivers.
            </p>
          </div>
        ) : null}
        {!selectionKey && props.errorMessage ? (
          <ErrorState
            title="Selection data unavailable"
            message="The selection could not be prepared. Try again when the map data is available."
            onRetry={props.onRetry}
            className="px-4 py-5"
          />
        ) : null}
        {props.kind === "school" ? <SchoolDetail props={props} /> : <DistrictDetail props={props} />}
      </CardContent>
      {scenarioHref ? (
        <CardFooter className="p-4 pt-0">
          <Button asChild className="w-full" size="sm">
            <Link href={scenarioHref}>
              Open Scenario Lab
              <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
