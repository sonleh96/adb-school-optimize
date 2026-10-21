"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  type InputKey,
  type ListedSchool,
  type MissingValueKind,
  schoolFromDetail,
} from "@/lib/screening/copy";
import { useScreeningSchool } from "@/lib/screening/hooks";
import type { SchoolKey } from "@/lib/screening/types";
import { scoreRangeOf } from "@/lib/screening/workspace/score";
import { whyBlocks } from "@/lib/screening/workspace/why";

import { PlaceText } from "./PlaceText";
import { Sentence } from "./Sentence";
import styles from "./screening.module.css";

type NeedKey = "classrooms" | "housing" | "facilities" | "services" | "locality";
const NEED_KEYS: readonly NeedKey[] = ["classrooms", "housing", "facilities", "services", "locality"];
const OTHER_KEYS: readonly InputKey[] = ["area", "urgency", "reach", "air", "emissions", "land"];
const NEED_FIELD = {
  classrooms: "permanent_classroom_deficit",
  housing: "teacher_housing_deficit",
  facilities: "facility_presence_deficit",
  services: "service_deficit",
  locality: "locality_disadvantage",
} as const;
/** The glossary term that names each input. */
const TERM_OF = {
  classrooms: "need_classrooms",
  housing: "need_housing",
  facilities: "need_facilities",
  services: "need_services",
  locality: "need_locality",
  area: "area_context",
  urgency: "urgency",
  reach: "reach",
  air: "air_quality",
  emissions: "emissions",
  land: "land_cover",
} as const satisfies Record<InputKey, string>;

const f3 = (value: number) => value.toFixed(3);
const isNeedFirst = (rule: CopyRuleId) => rule === "need_first_u" || rule === "need_first_no_u";

function kindLabel(copy: BoundCopy, kind: MissingValueKind): string | null {
  switch (kind) {
    case "recorded":
      return null;
    case "blank":
      return copy.TERMS.unknown_value.label;
    case "unusable":
      return copy.TERMS.unusable_value.label;
    case "not_calculable":
      return copy.STRINGS.cannotWorkOut;
    case "unresolved":
      return copy.STRINGS.noReading;
  }
}

/** A small bar for a value from 0 to `max`; a missing value is a hatched, outlined bar, never an empty one. */
function Bar({ value, max = 1, width = 48 }: { value: number | null; max?: number; width?: number }) {
  if (value === null) return <span className={styles.barMissing} style={{ width }} aria-hidden />;
  const filled = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * width) : 0;
  return (
    <span className={styles.bar} style={{ width }} aria-hidden>
      <i style={{ width: filled }} />
    </span>
  );
}

interface CardProps {
  copy: BoundCopy;
  rule: CopyRuleId;
  /** The school as the list holds it; the card opens with this while the full record loads. */
  listed: ListedSchool;
  /** Every school of the list, for ties and twins. */
  schools: readonly ListedSchool[];
  /** Where the school sits in the list on screen, 0-based, and how many schools that list holds. */
  position: { index: number; total: number };
  /** The list has stepped aside for the card: the bar offers the way back instead of an eyebrow. */
  docked: boolean;
  stale: boolean;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
}

/**
 * The school card: who the school is, its one place, why it sits there, and its numbers. It opens at once with what
 * the list knows (name, place) and fills in from the school's full record. Under the paper's main rule it carries
 * the paper's persistence flag when the school has it.
 */
export function SchoolCard(props: CardProps) {
  const { copy, rule, listed, schools, position, docked, stale, onStep, onClose } = props;
  const detail = useScreeningSchool(listed.id as SchoolKey);
  const record = useMemo((): CopySchool | null => {
    if (!detail.data) return null;
    try {
      return schoolFromDetail(detail.data, rule);
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [detail.data, rule]);
  const school: CopySchool | ListedSchool = record ?? listed;
  const scroll = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A new school starts at the top of the card.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [listed.id]);
  // When the list steps aside for the card, the row that had focus goes with it, so the card takes focus: on its
  // heading, so the school's name is read first. Focus already in the card (its previous or next) stays where it is.
  useEffect(() => {
    if (!docked || card.current?.contains(document.activeElement)) return;
    heading.current?.focus({ preventScroll: true });
  }, [docked, listed.id]);

  const { LAYOUT, STRINGS, TERMS, HELP } = copy;
  const queued = listed.cohort === "queue";
  const name = copy.distinctName(listed, schools);
  const headline = copy.placeHeadline(school, rule);
  const tie = copy.segments.tieNote(school, rule, schools, "card");
  // The figure's setting: a status in words, a range of places, or one place (a range whose ends meet included).
  const result = listed.results?.[rule] ?? null;
  const heroForm =
    queued || !/\d/.test(headline)
      ? "word"
      : listed.cohort === "interval" && result !== null && result.rank_best !== result.rank_worst
        ? "range"
        : "point";
  const heroLabel = queued
    ? TERMS.queue.label
    : LAYOUT.underRule(
        listed.cohort === "interval" ? TERMS.rank_range.label : TERMS.rank.label,
        copy.ruleName(rule)
      );

  return (
    <aside
      ref={card}
      className={`${styles.panel} ${styles.card}`}
      data-slot="school-card"
      data-region="inspector"
      aria-label={name}
      aria-busy={stale || detail.isPending}
      data-stale={stale || undefined}
    >
      <div className={styles.cardBar}>
        {docked ? (
          <button type="button" className={styles.dockBack} onClick={onClose}>
            <ChevronLeft size={13} aria-hidden />
            {LAYOUT.orderedTab}
          </button>
        ) : (
          <span className={styles.eyebrow}>{queued ? STRINGS.notPlaced : LAYOUT.selectedSchool}</span>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-label={LAYOUT.prevSchool}
          title={LAYOUT.prevSchool}
          disabled={position.index <= 0}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
        <span className={styles.cardPos}>
          {position.index >= 0 ? LAYOUT.positionOf(position.index + 1, position.total) : LAYOUT.notInList}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={LAYOUT.nextSchool}
          title={LAYOUT.nextSchool}
          disabled={position.index < 0 || position.index >= position.total - 1}
          onClick={() => onStep(1)}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={HELP.close}
          title={HELP.close}
          data-testid="close-card"
          onClick={onClose}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      <div ref={scroll} className={styles.cardScroll}>
        <header className={styles.cardHead}>
          <h2 ref={heading} className={styles.cardName} tabIndex={-1}>
            {name}
          </h2>
          <p className={styles.cardMeta}>{copy.locationLine(listed)}</p>
        </header>
        <div className={styles.hero} data-region="inspector-place" data-form={heroForm}>
          <div className={styles.heroFigure} data-testid="card-place">
            <PlaceText text={headline} />
          </div>
          <div className={styles.heroLabel}>
            <b>{heroLabel}</b>
            <span data-testid="card-context">
              {copy.placeContext(school, rule, { shortlist: 20 })}
              {tie ? (
                <>
                  {" "}
                  <Sentence segments={tie} />
                </>
              ) : null}
            </span>
          </div>
        </div>
        {record === null ? (
          <CardPending
            failed={detail.isError || (detail.isSuccess && record === null)}
            copy={copy}
            retry={detail.refetch}
          />
        ) : queued ? (
          <IncompleteRecord copy={copy} rule={rule} school={record} />
        ) : (
          <>
            <WhyItSitsHere copy={copy} rule={rule} school={record} />
            <InNumbers copy={copy} rule={rule} school={record} />
          </>
        )}
      </div>
    </aside>
  );
}

function CardPending({ failed, copy, retry }: { failed: boolean; copy: BoundCopy; retry: () => void }) {
  if (!failed) return <div className={styles.cardLoading} aria-hidden />;
  return (
    <div className={styles.cardFailed} role="alert">
      <p>{copy.LAYOUT.loadFailed}</p>
      <button type="button" className={styles.linkButton} onClick={() => retry()}>
        {copy.LAYOUT.retry}
      </button>
    </div>
  );
}

function WhyItSitsHere({ copy, rule, school }: { copy: BoundCopy; rule: CopyRuleId; school: CopySchool }) {
  const { LAYOUT, STRINGS, TERMS } = copy;
  const why = whyBlocks<InputKey>(
    copy.reasonSentence(school, rule),
    copy.topDrivers(school, rule),
    NEED_KEYS
  );
  const needValue = school.components.N;
  const persistence = copy.persistenceNote(school, rule);
  return (
    <section className={styles.why} data-region="inspector-why" aria-label={LAYOUT.why}>
      <span className={`${styles.eyebrow} ${styles.eyebrowNavy}`}>{LAYOUT.why}</span>
      {why.lead ? <p className={styles.whyLead}>{why.lead}</p> : null}
      {why.blocks.map((block, index): ReactNode => {
        switch (block.kind) {
          case "text":
            return (
              <p key={index} className={styles.whyText}>
                {block.text}
              </p>
            );
          case "need":
            return (
              <div key={index} className={styles.needBox} data-region="need-box">
                <div className={styles.needHead}>
                  <span>{TERMS.school_need.label}</span>
                  <b>{needValue === null ? STRINGS.cannotWorkOut : f3(needValue)}</b>
                </div>
                <ul className={styles.needParts}>
                  {block.parts.map((part) => {
                    const value = school.need_parts?.[NEED_FIELD[part.key as NeedKey]] ?? null;
                    return (
                      <li key={part.key} data-on={part.n !== null || undefined}>
                        <span className={styles.reasonN}>{part.n ?? ""}</span>
                        <span className={styles.needLabel}>{TERMS[TERM_OF[part.key]].label}</span>
                        <Bar value={value} />
                        <span className={styles.needValue}>
                          {value === null ? STRINGS.notRecorded : f3(value)}
                        </span>
                        {part.sentence ? <span className={styles.needSentence}>{part.sentence}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          case "reason":
            return (
              <div key={index} className={styles.reason}>
                <span className={styles.reasonN}>{block.n}</span>
                <div>
                  <span className={styles.reasonLabel}>{TERMS[TERM_OF[block.key]].label}</span>
                  {block.sentence}
                </div>
              </div>
            );
        }
      })}
      {/* The paper's flag, under the circulated rule only; a flag only just over the line says so (copy owns both). */}
      {persistence.length ? (
        <p className={styles.flag} data-region="persistent-flag">
          {persistence.join(" ")}
        </p>
      ) : null}
      {school.cohort === "interval" ? null : (
        <p className={styles.record} data-region="inspector-record">
          {copy.missingSentence(school, rule)}
        </p>
      )}
    </section>
  );
}

function InNumbers({ copy, rule, school }: { copy: BoundCopy; rule: CopyRuleId; school: CopySchool }) {
  const { LAYOUT, STRINGS, TERMS } = copy;
  const contrib = copy.contributions(school, rule);
  if (!contrib) return null;
  const needFirst = isNeedFirst(rule);
  const known = Object.values(contrib).filter((v): v is number => typeof v === "number");
  const needSum = NEED_KEYS.reduce((total, key) => total + (contrib[key] ?? 0), 0);
  const scale = Math.max(...known, needFirst ? 1 : 0.06);
  const own = school.results?.[rule];
  const range = scoreRangeOf(own);

  const row = (key: InputKey, part: boolean) => {
    const label = TERMS[TERM_OF[key]].label;
    if (key === "urgency" && !copy.ruleUsesUrgency(rule)) {
      return (
        <div key={key} className={`${styles.numRow} ${styles.numNote}`}>
          <span className={styles.numLabel}>{label}</span>
          <span className={styles.numFull}>{copy.urgencyNote(rule)}</span>
        </div>
      );
    }
    if (!(key in contrib)) return null;
    const value = contrib[key] ?? null;
    const kind = value === null ? copy.missingValueKind(school, key) : "recorded";
    return (
      <div
        key={key}
        className={`${styles.numRow} ${part ? styles.numPart : ""}`}
        data-missing={value === null || undefined}
      >
        <span className={styles.numLabel}>{label}</span>
        <Bar value={value} max={scale} width={64} />
        {value === null ? (
          <>
            <span className={styles.numMissing}>{kindLabel(copy, kind) ?? STRINGS.notRecorded}</span>
            <span className={styles.numFull}>{copy.missingValueNote(school, key)}</span>
          </>
        ) : (
          <span className={styles.numValue}>{f3(value)}</span>
        )}
      </div>
    );
  };

  const total = needFirst ? school.components.N : (own?.score_point ?? null);
  const totalText =
    total !== null
      ? f3(total)
      : range
        ? range[0] === range[1]
          ? f3(range[0])
          : LAYOUT.valueRange(f3(range[0]), f3(range[1]))
        : null;

  return (
    <section className={styles.numbers} data-region="inspector-breakdown" aria-label={LAYOUT.numbers}>
      <span className={styles.eyebrow}>{LAYOUT.numbers}</span>
      <div className={styles.numTotal}>
        <span>{needFirst ? TERMS.school_need.label : TERMS.score.label}</span>
        {totalText ? <b>{totalText}</b> : null}
      </div>
      <p className={styles.numNoteText}>{needFirst ? STRINGS.schoolNeedDefinition : TERMS.score.line}</p>
      <div className={styles.numSub}>{needFirst ? LAYOUT.needParts : LAYOUT.adds}</div>
      <div className={styles.numTable}>
        {needFirst ? null : (
          <div className={`${styles.numRow} ${styles.numHead}`}>
            <span className={styles.numLabel}>{TERMS.school_need.label}</span>
            <Bar value={needSum} max={Math.max(scale, needSum)} width={64} />
            <span className={styles.numValue}>{f3(needSum)}</span>
          </div>
        )}
        {NEED_KEYS.map((key) => row(key, !needFirst))}
        {needFirst ? null : OTHER_KEYS.map((key) => row(key, false))}
      </div>
      <p className={styles.numNoteText} data-region="score-note">
        {STRINGS.scoreNote}
      </p>
      {needFirst ? null : <p className={styles.numNoteText}>{STRINGS.separateMeasures}</p>}
    </section>
  );
}

/** The card of a school with an incomplete record: what is missing first, then what the record says, part by part. */
function IncompleteRecord({ copy, rule, school }: { copy: BoundCopy; rule: CopyRuleId; school: CopySchool }) {
  const { LAYOUT, TERMS } = copy;
  const sentences = copy.missingSentences(school, rule);
  const tag = (kind: MissingValueKind) => {
    const label = kindLabel(copy, kind);
    return label ? <span className={styles.kindTag}>{label}</span> : null;
  };
  return (
    <>
      <section
        className={`${styles.why} ${styles.whyGrey}`}
        data-region="inspector-why"
        aria-label={LAYOUT.whatMissing}
      >
        <span className={styles.eyebrow}>{LAYOUT.whatMissing}</span>
        <span className={styles.chipsBig} data-region="queue-missing">
          {copy.missingLabels(school).map((label) => (
            <span key={label} className={styles.chip}>
              {label}
            </span>
          ))}
        </span>
        {/* The last two sentences say what the place context above already says. */}
        <p className={styles.whyLead}>{sentences.slice(0, -2).join(" ")}</p>
      </section>
      <section className={styles.numbers} data-region="inspector-record" aria-label={LAYOUT.recordSays}>
        <span className={styles.eyebrow}>{LAYOUT.recordSays}</span>
        <ul className={styles.facts}>
          <li>
            <span className={styles.factLabel}>
              {TERMS.school_need.label}
              {tag(copy.missingValueKind(school, "need"))}
            </span>
            {copy.missingValueNote(school, "need")}
          </li>
          {NEED_KEYS.map((key) => {
            const kind = copy.missingValueKind(school, key);
            return (
              <li key={key}>
                <span className={styles.factLabel}>
                  {TERMS[TERM_OF[key]].label}
                  {tag(kind)}
                </span>
                {kind === "recorded" ? copy.inputSentence(school, key) : copy.missingValueNote(school, key)}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
