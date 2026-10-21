"use client";

import { ChevronRight } from "lucide-react";

import type { BoundCopy, CopyRuleId, CopySchool, InputKey } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { type ComparedSchool, type MoveEdges, topStatus } from "@/lib/screening/method/compare";
import { moveHex } from "@/lib/screening/method/moves";
import { shareText } from "@/lib/screening/method/shares";
import type { DetailResult, Rule, SchoolDetailResponse } from "@/lib/screening/types";

import { PlaceText } from "../PlaceText";
import base from "../screening.module.css";
import styles from "./card.module.css";

const f3 = (value: number) => value.toFixed(3);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const BAR = 64;

type Component = "N" | "A" | "U" | "R" | "Q" | "E" | "L";
const COMPONENTS: readonly Component[] = ["N", "A", "U", "R", "Q", "E", "L"];
/** Each input's glossary term, and the copy's key for its missing-value words. */
const TERM = {
  N: "school_need",
  A: "area_context",
  U: "urgency",
  R: "reach",
  Q: "air_quality",
  E: "emissions",
  L: "land_cover",
} as const;
const KEY: Record<Component, InputKey | "need"> = {
  N: "need",
  A: "area",
  U: "urgency",
  R: "reach",
  Q: "air",
  E: "emissions",
  L: "land",
};
const PARTS = [
  ["permanent_classroom_deficit", "need_classrooms", "classrooms"],
  ["teacher_housing_deficit", "need_housing", "housing"],
  ["facility_presence_deficit", "need_facilities", "facilities"],
  ["service_deficit", "need_services", "services"],
  ["locality_disadvantage", "need_locality", "locality"],
] as const;

function Bar({ track, fill, missing }: { track: number; fill: number; missing?: boolean }) {
  const t = Math.max(1, track);
  return (
    <svg width={BAR} height="10" aria-hidden className={styles.bar}>
      {missing ? (
        <rect x="0.5" y="1.5" width={t - 1} height="7" rx="1" className={styles.barMissing} />
      ) : (
        <>
          <rect x="0" y="1" width={t} height="8" rx="1" fill="rgba(21,24,29,.07)" />
          <rect x="0" y="1" width={Math.max(fill > 0 ? 1.5 : 0, fill)} height="8" rx="1" fill="#1c5cab" />
        </>
      )}
    </svg>
  );
}

/** A missing value in words, never as zero: the copy's kind of missing, with its note as the title. */
function Missing({ copy, school, input }: { copy: BoundCopy; school: CopySchool; input: InputKey | "need" }) {
  const { TERMS, STRINGS } = copy;
  const kind = copy.missingValueKind(school, input);
  const words =
    kind === "blank"
      ? TERMS.unknown_value.label
      : kind === "unusable"
        ? TERMS.unusable_value.label
        : kind === "not_calculable"
          ? STRINGS.cannotWorkOut
          : STRINGS.noReading;
  return (
    <span className={styles.missing} title={copy.missingValueNote(school, input)}>
      {words}
    </span>
  );
}

/** A share as the rule states it: its fraction from the rules when they name the same share, else the number. */
function shareOf(rule: Rule | undefined, component: string, weight: number): string {
  const stated = rule?.weights.find((w) => w.component === component && Math.abs(w.value - weight) < 1e-12);
  return shareText({ component, value: weight, fraction: stated?.fraction ?? String(+weight.toFixed(4)) });
}

/** What each input adds under one rule, from the API's record of the run: share, value, what it adds, the total. */
function Breakdown({
  copy,
  method,
  rule,
  ruleInfo,
  result,
  school,
  parts,
  onParts,
  named = false,
}: {
  copy: BoundCopy;
  method: Method;
  rule: CopyRuleId;
  /** Two tables stack in compare mode, so each names its rule. */
  named?: boolean;
  ruleInfo: Rule | undefined;
  result: DetailResult;
  school: CopySchool;
  parts: boolean;
  onParts: () => void;
}) {
  const { TERMS, LAYOUT } = copy;
  const byComponent = new Map(result.contributions.map((c) => [c.component, c]));
  const weights = result.contributions.map((c) => c.weight ?? 0).filter((w) => w > 0);
  const max = Math.max(...weights, 0.0001);
  const px = (w: number) => (w / max) * BAR;
  const drivers = new Set(copy.topDrivers(school, rule).map((d) => d.key as string));
  const needDriver = PARTS.some(([, , key]) => drivers.has(key));
  const open = needDriver !== parts;
  const values = result.components as Record<string, number | null | undefined>;
  const usesUrgency = "U" in result.components;
  const shown = COMPONENTS.filter((c) => byComponent.has(c));

  return (
    <section className={styles.sec} data-region="inspector-breakdown" aria-label={method.insp.produces}>
      <div className={styles.secHead}>
        <span className={base.eyebrow}>{method.insp.produces}</span>
        <span className={base.eyebrow}>
          {named
            ? copy.ruleShortName(rule)
            : rule === "additive_no_u"
              ? method.insp.derivedSplit
              : method.insp.recordedSplit}
        </span>
      </div>
      <div className={styles.table} role="table" aria-label={method.insp.produces}>
        <div className={styles.tr} role="row">
          <span role="columnheader" />
          <span role="columnheader" className={styles.th}>
            {method.insp.inputAndWeight}
          </span>
          <span role="columnheader" />
          <span role="columnheader" className={`${styles.th} ${styles.num}`}>
            {method.insp.value}
          </span>
          <span role="columnheader" className={`${styles.th} ${styles.num}`}>
            {method.insp.adds}
          </span>
        </div>
        {shown.map((c) => {
          const contribution = byComponent.get(c)!;
          const weight = contribution.weight ?? 0;
          const value = values[c] ?? null;
          const range = Math.abs(contribution.upper - contribution.lower) > 1e-12;
          const isNeed = c === "N" && result.need_part_contributions !== null;
          return (
            <div key={c} className={styles.group} role="rowgroup">
              <div className={styles.tr} role="row">
                <span role="cell" className={styles.dotCell}>
                  {drivers.has(KEY[c]) ? (
                    <i className={styles.dot} title={method.insp.topReason}>
                      <span className={styles.sr}>{method.insp.topReason}</span>
                    </i>
                  ) : null}
                </span>
                <span role="rowheader" className={styles.label}>
                  {isNeed ? (
                    <button type="button" className={styles.expander} aria-expanded={open} onClick={onParts}>
                      {TERMS[TERM[c]].label}
                      <ChevronRight size={11} aria-hidden />
                    </button>
                  ) : (
                    TERMS[TERM[c]].label
                  )}
                  <span className={styles.times}>{method.insp.times(shareOf(ruleInfo, c, weight))}</span>
                </span>
                <span role="cell">
                  <Bar track={px(weight)} fill={px(contribution.lower)} missing={value === null} />
                </span>
                <span role="cell" className={styles.num}>
                  {value === null ? <Missing copy={copy} school={school} input={KEY[c]} /> : f3(value)}
                </span>
                <span
                  role="cell"
                  className={`${styles.num} ${styles.strong}`}
                  title={
                    range
                      ? method.insp.addsBetween(f3(contribution.lower), f3(contribution.upper))
                      : undefined
                  }
                >
                  {range
                    ? LAYOUT.valueRange(
                        contribution.lower === 0 ? "0" : f3(contribution.lower),
                        f3(contribution.upper)
                      )
                    : f3(contribution.lower)}
                </span>
              </div>
              {isNeed && open
                ? PARTS.map(([field, term, key]) => {
                    const part = school.need_parts?.[field] ?? null;
                    const adds = result.need_part_contributions?.[field] ?? null;
                    return (
                      <div key={field} className={`${styles.tr} ${styles.part}`} role="row">
                        <span role="cell" className={styles.dotCell}>
                          {drivers.has(key) ? (
                            <i className={styles.dot} title={method.insp.topReason}>
                              <span className={styles.sr}>{method.insp.topReason}</span>
                            </i>
                          ) : null}
                        </span>
                        <span role="rowheader" className={styles.label}>
                          {TERMS[term].label}
                        </span>
                        <span role="cell">
                          <Bar track={px(weight / 5)} fill={px(adds ?? 0)} missing={part === null} />
                        </span>
                        <span role="cell" className={styles.num}>
                          {part === null ? <Missing copy={copy} school={school} input={key} /> : f3(part)}
                        </span>
                        <span role="cell" className={styles.num}>
                          {adds === null ? "" : f3(adds)}
                        </span>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}
        {usesUrgency ? null : (
          <div className={styles.tr} role="row">
            <span role="cell" />
            <span role="cell" className={styles.full}>
              {copy.urgencyNote(rule)}
            </span>
          </div>
        )}
        <div className={`${styles.tr} ${styles.total}`} role="row">
          <span role="cell" />
          <span role="rowheader" className={styles.label}>
            {TERMS.score.label}
          </span>
          <span role="cell" />
          <span role="cell" />
          <span role="cell" className={`${styles.num} ${styles.strong}`}>
            {result.scores.point !== null
              ? f3(result.scores.point)
              : result.scores.lower !== null && result.scores.upper != null
                ? LAYOUT.valueRange(f3(result.scores.lower), f3(result.scores.upper))
                : ""}
          </span>
        </div>
      </div>
      <p className={styles.note}>
        {method.insp.trackNote(lcFirst(copy.ruleLabel(rule)))}
        {rule === "additive_no_u" ? method.insp.derivedNote : ""}
      </p>
    </section>
  );
}

/** One rule's place, as the method details word it: a bare number, possible places, or no result. */
function placeOf(copy: BoundCopy, result: DetailResult | null) {
  if (!result || result.cohort === "verification_queue") return null;
  const bounds = result.rank_bounds;
  if (result.cohort === "complete" && result.point_rank.rank !== null)
    return { kind: "point" as const, text: String(result.point_rank.rank) };
  if (bounds.best === null || bounds.worst === null) return null;
  return bounds.best === bounds.worst
    ? { kind: "exact" as const, text: copy.ordinal(bounds.best) }
    : {
        kind: "range" as const,
        text: copy.LAYOUT.placeRange(copy.ordinal(bounds.best), copy.ordinal(bounds.worst)),
      };
}

/** The school's place under every rule the API ran, the rule on screen marked. */
function Across({
  copy,
  method,
  detail,
  marked,
  interval,
}: {
  copy: BoundCopy;
  method: Method;
  detail: SchoolDetailResponse;
  marked: readonly string[];
  interval: boolean;
}) {
  return (
    <section className={styles.sec} data-region="inspector-across" aria-label={method.insp.across()}>
      <div className={styles.secHead}>
        <span className={base.eyebrow}>{method.insp.across(detail.rules.length)}</span>
        <span className={base.eyebrow}>{interval ? method.insp.rangeOf : method.insp.rankOf}</span>
      </div>
      <dl className={styles.across}>
        {detail.rules.map((entry) => {
          const id = entry.rule.rule_id as CopyRuleId;
          const place = placeOf(copy, entry.result);
          const on = marked.includes(id);
          return (
            <div key={id} className={styles.acrossRow} data-on={on || undefined}>
              <dt>{copy.ruleLabel(id)}</dt>
              <dd>
                {place ? (
                  <>
                    {place.kind === "exact" ? (
                      <span className={styles.exact}>{method.sameEitherWay}</span>
                    ) : null}
                    {place.text}
                  </>
                ) : (
                  <span className={styles.na}>{method.noResultForSchool}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** The record behind the numbers: the school's id, the persistence test in the research team's terms, its counts. */
function Record({
  copy,
  method,
  school,
  detail,
  rules,
}: {
  copy: BoundCopy;
  method: Method;
  school: CopySchool;
  detail: SchoolDetailResponse;
  rules: readonly CopyRuleId[];
}) {
  const persistent =
    rules.includes("additive_u") &&
    detail.rules.some((e) => e.rule.rule_id === "additive_u" && e.persistent_candidate === true);
  const cond = method.insp.cond;
  const values = school.condition as Record<string, number | string | null>;
  return (
    <section className={styles.sec} aria-label={method.insp.evidence}>
      <div className={styles.secHead}>
        <span className={base.eyebrow}>{method.insp.evidence}</span>
        <span className={`${base.eyebrow} ${styles.mono}`} title={method.insp.schoolId}>
          {detail.school.school_key}
        </span>
      </div>
      {persistent ? <p className={styles.flag}>{method.insp.persistent}</p> : null}
      <dl className={styles.cond}>
        {(Object.keys(cond) as (keyof typeof cond)[]).map((key) => {
          const value = values[key] ?? null;
          return (
            <div key={key}>
              <dt>{cond[key]}</dt>
              <dd className={value === null ? styles.na : undefined}>
                {value === null ? lcFirst(copy.STRINGS.notRecorded) : String(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export interface CompareCard {
  a: CopyRuleId;
  b: CopyRuleId;
  k: number;
  edges: MoveEdges;
  /** How many schools both rules put in order. */
  n: number;
  /** The school's places among the schools both rules put in order; null when it is not among them. */
  row: ComparedSchool | null;
}

/**
 * The card's method layer, below the school's name: the place as a number with its group, the screening score and
 * the possible places among all, the reason, what each input adds with its share, every rule's place, the record.
 * In compare mode, the two places side by side, how far the school moved, and what each input adds under both.
 */
export function MethodCard({
  copy,
  method,
  rule,
  school,
  detail,
  rules,
  parts,
  onParts,
  compare,
}: {
  copy: BoundCopy;
  method: Method;
  rule: CopyRuleId;
  school: CopySchool;
  detail: SchoolDetailResponse;
  rules: readonly Rule[] | null;
  parts: boolean;
  onParts: () => void;
  compare: CompareCard | null;
}) {
  const { TERMS, LAYOUT, STRINGS } = copy;
  const resultOf = (id: CopyRuleId) => detail.rules.find((e) => e.rule.rule_id === id)?.result ?? null;
  const ruleOf = (id: CopyRuleId) => rules?.find((r) => r.rule_id === id);
  const result = resultOf(rule);
  const label = lcFirst(copy.ruleLabel(rule));

  if (school.cohort === "queue" || !result || result.cohort === "verification_queue") {
    return (
      <>
        <div className={base.hero} data-region="inspector-place" data-form="word">
          <div className={base.heroFigure}>{STRINGS.notPlaced}</div>
          <div className={base.heroLabel}>
            <b>{TERMS.queue.label}</b>
            <span>{copy.missingLabels(school).join(", ")}</span>
          </div>
        </div>
        <section className={styles.callout} data-region="inspector-why" data-tone="grey">
          <span className={base.eyebrow}>{LAYOUT.whatMissing}</span>
          <p>{copy.missingSentence(school, rule)}</p>
        </section>
        <Record copy={copy} method={method} school={school} detail={detail} rules={[rule]} />
      </>
    );
  }

  if (compare) {
    const block = (id: CopyRuleId) => {
      const place = placeOf(copy, resultOf(id));
      return (
        <div className={styles.block}>
          <span className={base.eyebrow}>{copy.ruleShortName(id)}</span>
          <div className={styles.blockFigure} data-kind={place?.kind ?? "none"}>
            {place ? <PlaceText text={place.text} /> : method.insp.noResultHero}
          </div>
          <p className={styles.blockSub}>
            {place === null
              ? method.noResultForSchool
              : place.kind === "point"
                ? method.compare.slopeMid(compare.n)
                : method.compare.rangesSub()}
          </p>
        </div>
      );
    };
    const row = compare.row;
    const status = row ? topStatus(row, compare.k) : null;
    const top =
      status === "both"
        ? method.compare.topBoth(compare.k)
        : status === "enters"
          ? method.compare.topEnters(compare.k)
          : status === "leaves"
            ? method.compare.topLeaves(compare.k)
            : null;
    return (
      <>
        <div className={styles.blocks} data-region="inspector-place">
          {block(compare.a)}
          {block(compare.b)}
        </div>
        {row ? (
          <p className={styles.moveLine}>
            <span
              className={styles.swatch}
              style={{ background: moveHex(row.d, compare.edges) }}
              aria-hidden
            />
            <span>
              {row.d === 0
                ? method.samePlaceUnder(copy.ruleShortName(compare.b))
                : method.compare.moveWords(row.d, copy.ruleShortName(compare.b))}
              {top ? `; ${top}` : ""}
            </span>
          </p>
        ) : (
          <section className={styles.callout} data-region="inspector-why">
            <span className={base.eyebrow}>{method.insp.whyRange}</span>
            <p>{copy.rangeComparisonSentence(school, compare.a, compare.b)}</p>
          </section>
        )}
        {[compare.a, compare.b].map((id) => {
          const r = resultOf(id);
          return r && r.cohort !== "verification_queue" ? (
            <Breakdown
              key={id}
              copy={copy}
              method={method}
              rule={id}
              ruleInfo={ruleOf(id)}
              result={r}
              school={school}
              parts={parts}
              onParts={onParts}
              named
            />
          ) : null;
        })}
        <Across
          copy={copy}
          method={method}
          detail={detail}
          marked={[compare.a, compare.b]}
          interval={school.cohort === "interval"}
        />
        <Record copy={copy} method={method} school={school} detail={detail} rules={[compare.a, compare.b]} />
      </>
    );
  }

  const place = placeOf(copy, result);
  const needFirst = result.scores.sort_key_primary !== null;
  const score = needFirst ? result.scores.sort_key_primary : result.scores.point;
  const bounds = result.rank_bounds;
  return (
    <>
      <div
        className={base.hero}
        data-region="inspector-place"
        data-form={place?.kind === "range" ? "range" : "point"}
      >
        <div className={base.heroFigure}>{place ? <PlaceText text={place.text} /> : null}</div>
        <div className={base.heroLabel}>
          <b>{place?.kind === "range" ? TERMS.rank_range.label : TERMS.rank.label}</b>
          <span>
            {place?.kind === "point"
              ? method.insp.amongComplete(label)
              : place?.kind === "exact"
                ? method.insp.coincide(label)
                : method.insp.bestToWorst(label)}
          </span>
        </div>
      </div>
      {place?.kind === "point" ? (
        <dl className={styles.facts}>
          <div>
            <dt>{needFirst ? TERMS.school_need.label : TERMS.score.label}</dt>
            <dd>{score !== null ? f3(score) : ""}</dd>
          </div>
          <div>
            <dt>{LAYOUT.amongAll124}</dt>
            <dd>
              {bounds.best !== null && bounds.worst !== null
                ? bounds.best === bounds.worst
                  ? copy.ordinal(bounds.best)
                  : LAYOUT.placeRange(copy.ordinal(bounds.best), copy.ordinal(bounds.worst))
                : method.insp.noResult}
            </dd>
          </div>
          <div>
            <dt>{LAYOUT.byProvince}</dt>
            <dd className={styles.small}>{school.province ?? lcFirst(STRINGS.notRecorded)}</dd>
          </div>
        </dl>
      ) : null}
      <section className={styles.callout} data-region="inspector-why">
        <span className={base.eyebrow}>{place?.kind === "point" ? LAYOUT.why : method.insp.whyRange}</span>
        <p>{place?.kind === "point" ? copy.reasonSentence(school, rule) : copy.rankSentence(school, rule)}</p>
      </section>
      <Breakdown
        copy={copy}
        method={method}
        rule={rule}
        ruleInfo={ruleOf(rule)}
        result={result}
        school={school}
        parts={parts}
        onParts={onParts}
      />
      <Across
        copy={copy}
        method={method}
        detail={detail}
        marked={[rule]}
        interval={school.cohort === "interval"}
      />
      <Record copy={copy} method={method} school={school} detail={detail} rules={[rule]} />
    </>
  );
}
