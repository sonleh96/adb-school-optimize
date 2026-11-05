"use client";

import { useMemo, useState } from "react";

import { PART_KEYS, partColumns } from "@/lib/explore/parts";
import { type CopySchool, bindCopy, inList, isCopyRuleId } from "@/lib/screening/copy";
import { EXPLORE } from "@/lib/screening/copy/explore";
import type { InputsResponse, ResultsResponse, RulesResponse } from "@/lib/screening/types";

import { type Marked, PartChart } from "./PartChart";
import { type PickerGroup, SchoolPicker } from "./SchoolPicker";
import styles from "./explore.module.css";
import { Drivers } from "./sections/Drivers";
import { Province } from "./sections/Province";
import { ProvinceMap } from "./sections/ProvinceMap";
import { Stability } from "./sections/Stability";

/** The school the address marks. This chunk only ever runs in the browser, so the address is there to read. */
const markedInAddress = (): string | null =>
  new URLSearchParams(window.location.search).get("school") || null;

/**
 * Keeps the marked school in the address, as `/screening` keeps an open school, so a link opens the page with it
 * marked. Each choice replaces the address rather than adding to the history: Back leaves the page.
 */
function writeMarked(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("school", id);
  else url.searchParams.delete("school");
  window.history.replaceState(window.history.state, "", url);
}

/** The schools of the list by province, each by the name the tool shows it by, both in alphabetical order. */
function groupsOf(
  listed: readonly CopySchool[],
  name: (school: CopySchool) => string,
  province: (s: CopySchool) => string
) {
  const byProvince = new Map<string, { id: string; name: string }[]>();
  for (const school of listed) {
    const heading = province(school);
    byProvince.set(heading, [...(byProvince.get(heading) ?? []), { id: school.id, name: name(school) }]);
  }
  return [...byProvince.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([heading, schools]): PickerGroup => ({
      province: heading,
      schools: schools.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * The explore page's charts, bound to the data: the school picker over every chart, then each question with its
 * charts. Set 1 asks how the schools of the list compare on each part of school need, and set 2 how stable the list
 * is.
 */
export function ExploreBody({
  rules,
  results,
  inputs,
  failed,
}: {
  rules: RulesResponse;
  results: ResultsResponse;
  inputs: InputsResponse;
  failed: string;
}) {
  const rule = results.run.rule_id;
  const bound = useMemo(() => {
    if (!isCopyRuleId(rule)) return null;
    try {
      return { rule, ...bindCopy({ view: rule, inputs, lists: [results], ruleNames: "plain" }) };
    } catch {
      // A list and stored inputs of two data versions, read either side of a reload: nothing here is true of both.
      return null;
    }
  }, [rule, inputs, results]);
  const [marked, setMarked] = useState<string | null>(markedInAddress);

  const view = useMemo(() => {
    if (!bound) return null;
    const { copy, schools } = bound;
    const listed = schools.filter((school) => inList(school, bound.rule));
    const names = new Map(listed.map((school) => [school.id, copy.distinctName(school, listed)]));
    return {
      listed,
      names,
      groups: groupsOf(
        listed,
        (school) => names.get(school.id)!,
        (school) => copy.provinceHeading(school.province)
      ),
      charts: PART_KEYS.map((key) => partColumns(key, schools, bound.rule)),
    };
  }, [bound]);

  if (!bound || !view)
    return (
      <p className={styles.state} role="alert">
        {failed}
      </p>
    );

  const { copy, schools } = bound;
  const school = marked ? (view.listed.find((s) => s.id === marked) ?? null) : null;
  const markFor = (key: (typeof PART_KEYS)[number]): Marked | null =>
    school
      ? {
          id: school.id,
          name: view.names.get(school.id)!,
          lines: [
            copy.inputSentence(school, key),
            copy.partStanding(school, bound.rule, key, schools),
          ].filter((line): line is string => line !== null),
        }
      : null;
  const version = rules.input_versions?.find((v) => v.input_version === results.run.input_version);
  const choose = (id: string | null) => {
    setMarked(id);
    writeMarked(id);
  };

  return (
    <>
      <div className={styles.controls}>
        <SchoolPicker groups={view.groups} value={school ? school.id : null} onChange={choose} />
        {marked && !school ? (
          <p className={styles.note} role="status">
            {EXPLORE.pick.notInList}
          </p>
        ) : null}
        {school ? (
          <p className={styles.legend} data-region="legend">
            <span>
              <span className={styles.key} data-chosen="" aria-hidden="true" />
              {view.names.get(school.id)}
            </span>
            <span>
              <span className={styles.key} aria-hidden="true" />
              {EXPLORE.others}
            </span>
          </p>
        ) : null}
        <p className={styles.scope} data-region="scope">
          {EXPLORE.scope(view.listed.length, copy.ruleName(bound.rule))}{" "}
          {version
            ? copy.LAYOUT.dataVersion(results.run.input_version, copy.formatDay(new Date(version.created_at)))
            : null}
        </p>
      </div>
      <section className={styles.section} aria-labelledby="explore-compare" data-region="compare">
        <h2 id="explore-compare" className={styles.question}>
          {EXPLORE.compare.question}
        </h2>
        <p className={styles.sectionLede}>{EXPLORE.compare.lede}</p>
        <div className={styles.grid}>
          {view.charts.map((chart) => (
            <PartChart key={chart.key} chart={chart} marked={markFor(chart.key)} />
          ))}
        </div>
      </section>
      <Stability bound={bound} data={{ rules, results, inputs }} names={view.names} marked={school} />
      <Drivers rules={rules} results={results} copy={copy} names={view.names} marked={school?.id ?? null} />
      <Province
        rows={results.rows}
        rule={bound.rule}
        marked={school && { id: school.id, name: view.names.get(school.id)! }}
      />
      <ProvinceMap rows={results.rows} marked={school} names={view.names} />
    </>
  );
}
