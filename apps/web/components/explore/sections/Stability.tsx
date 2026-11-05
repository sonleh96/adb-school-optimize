"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { BUMP_RULES, bumpOf } from "@/lib/explore/bump";
import { type FrequencyPlot, frequencyPlot } from "@/lib/explore/frequencies";
import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  bindCopy,
  isCopyRuleId,
} from "@/lib/screening/copy";
import { EXPLORE_STABILITY } from "@/lib/screening/copy/explore-stability";
import type { PersistenceRule } from "@/lib/screening/copy/model";
import { useScreeningResults } from "@/lib/screening/hooks";
import type { InputsResponse, ResultsResponse, RuleId, RulesResponse } from "@/lib/screening/types";

import explore from "../explore.module.css";
import { StabilityBump } from "./StabilityBump";
import { StabilityFrequencies } from "./StabilityFrequencies";
import styles from "./stability.module.css";

/** The rules the paper's test of random weights ran for, the main rule first: each has its own experiment. */
const TESTED: readonly PersistenceRule[] = ["additive_no_u", "additive_u"];
const isTested = (rule: CopyRuleId): rule is PersistenceRule => (TESTED as readonly string[]).includes(rule);

/**
 * How far ahead of the screen the section starts reading the other rules' lists: a screen and a half, so they are in
 * by the time a reader scrolls to it, and a reader who never does reads none of them.
 */
const AHEAD = "150% 0px";

/** True once the element has come within `AHEAD` of the screen; it stays true. */
function useNear(element: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (near || !target) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: AHEAD }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, near]);
  return near;
}

/**
 * Set 2 of the explore page, how stable the list is: its answer, then how often each school stayed in the top 20 when
 * the weights changed at random, and where the main rule's top 20 sit under each of the seven rules. Both charts mark
 * the school the picker marks.
 *
 * The page's first load reads only the shown rule's list, which carries that rule's own test. The other rules' lists
 * are read when the section comes near the screen, by the hook every list is read by, so the earlier method's list is
 * one read whichever section asks for it first. Until they are in, the shown rule's test is drawn and the chart of
 * ranks says it is loading; a list that fails offers Retry there, and the rest of the page stays as it is.
 */
export function Stability({
  bound,
  data,
  names,
  marked,
}: {
  /**
   * The page's bound data: the rule it shows, which the chart of the top 20 follows; the copy; and every school of
   * its list with that rule's result and test.
   */
  bound: { readonly rule: CopyRuleId; readonly copy: BoundCopy; readonly schools: readonly CopySchool[] };
  /** What the page read: the rules the API offers, the shown rule's list and the stored inputs. */
  data: { readonly rules: RulesResponse; readonly results: ResultsResponse; readonly inputs: InputsResponse };
  /** The name the page shows each school of the list by. */
  names: ReadonlyMap<string, string>;
  marked: CopySchool | null;
}) {
  const { rule, copy, schools } = bound;
  const { rules, results, inputs } = data;
  const host = useRef<HTMLElement>(null);
  const near = useNear(host);
  const offers = (id: string) => rules.rules.some((r) => r.rule_id === id);
  const asked = BUMP_RULES.map((id) => (near && id !== rule && offers(id) ? { rule: id as RuleId } : null));
  const reads = [
    useScreeningResults(asked[0]),
    useScreeningResults(asked[1]),
    useScreeningResults(asked[2]),
    useScreeningResults(asked[3]),
    useScreeningResults(asked[4]),
    useScreeningResults(asked[5]),
    useScreeningResults(asked[6]),
  ];
  // Only a list of the rule it was asked for counts: a read kept while another loads is not that rule's.
  const lists = reads.flatMap((read, i) =>
    asked[i] !== null && read.data?.run.rule_id === asked[i]!.rule ? [read.data] : []
  );
  const failed = reads.some((read, i) => asked[i] !== null && read.isError);
  const ready = near && lists.length === asked.filter((a) => a !== null).length;
  const urgencyList = lists.find((list) => list.run.rule_id === "additive_u") ?? null;

  const markedId = marked?.id ?? null;
  const listKey = lists.map((list) => list.run.rule_id).join(",");
  const bump = useMemo(() => {
    if (!ready || !isCopyRuleId(results.run.rule_id)) return null;
    const byRule = new Map<CopyRuleId, ResultsResponse>([[results.run.rule_id, results]]);
    for (const list of lists) if (isCopyRuleId(list.run.rule_id)) byRule.set(list.run.rule_id, list);
    return bumpOf(byRule, rule, markedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lists` is rebuilt each render; its rules are its key.
  }, [ready, results, rule, markedId, listKey]);
  // Each tested rule's shares come from its own list: the shown rule's from the page's binding, the earlier method's
  // from a binding with its own list, once it is in.
  const plots = useMemo(() => {
    const out = new Map<PersistenceRule, FrequencyPlot>();
    if (isTested(rule)) {
      const own = frequencyPlot(schools, rule, copy.persistenceTest(rule));
      if (own) out.set(rule, own);
    }
    if (urgencyList && rule !== "additive_u") {
      try {
        const urgency = bindCopy({ view: rule, inputs, lists: [results, urgencyList], ruleNames: "plain" });
        const plot = frequencyPlot(urgency.schools, "additive_u", urgency.copy.persistenceTest("additive_u"));
        if (plot) out.set("additive_u", plot);
      } catch {
        // Lists of two data versions, read either side of a reload: the earlier method's test is not drawn.
      }
    }
    return out;
  }, [rule, schools, copy, urgencyList, inputs, results]);
  // The earlier method's test is offered while its list is on its way, and drawn once it is in. When its read fails,
  // the dot plot says so and retries it, as the chart of ranks does.
  const urgencyAt = BUMP_RULES.indexOf("additive_u");
  const urgencyRead = reads[urgencyAt];
  const urgency =
    rule !== "additive_u" && offers("additive_u") && !urgencyList
      ? {
          failed: asked[urgencyAt] !== null && urgencyRead.isError,
          retry: () => void urgencyRead.refetch(),
        }
      : null;

  const W = EXPLORE_STABILITY;
  const ruleName = copy.ruleName(rule);
  const own = isTested(rule) ? plots.get(rule) : undefined;
  const top = bump ? bump.schools.filter((s) => s.top).length : 0;
  const answer = own
    ? W.answer(
        ruleName,
        own.persistent,
        own.words.thresholdPercent,
        bump?.kept ?? 0,
        top,
        bump?.rules.length ?? 1
      )
    : bump && top > 0
      ? W.bump.answer(bump.kept, top, bump.rules.length)
      : null;
  const titleId = useId();

  return (
    <section
      ref={host}
      className={explore.section}
      aria-labelledby="explore-stability"
      data-region="stability"
      data-lists={ready ? "ready" : failed ? "failed" : near ? "loading" : "waiting"}
    >
      <h2 id="explore-stability" className={explore.question}>
        {W.question}
      </h2>
      {answer ? (
        <p className={explore.sectionLede} data-region="stability-answer">
          {answer}
        </p>
      ) : null}
      <div className={explore.grid}>
        <StabilityFrequencies plots={plots} urgency={urgency} copy={copy} names={names} marked={marked} />
        {bump ? (
          top > 0 ? (
            <StabilityBump bump={bump} ruleName={ruleName} copy={copy} names={names} marked={marked} />
          ) : null
        ) : (
          <figure className={`${explore.part} ${styles.waiting}`} aria-labelledby={titleId} data-chart="bump">
            <h3 id={titleId} className={explore.partTitle}>
              {W.bump.title(ruleName)}
            </h3>
            {failed ? (
              <div className={explore.most} role="alert">
                <p>{copy.LAYOUT.loadFailed}</p>
                <button
                  type="button"
                  className={explore.retry}
                  onClick={() => {
                    for (const [i, read] of reads.entries())
                      if (asked[i] !== null && read.isError) void read.refetch();
                  }}
                >
                  {copy.LAYOUT.retry}
                </button>
              </div>
            ) : (
              <p className={explore.most} role="status">
                {W.bump.loading}
              </p>
            )}
          </figure>
        )}
      </div>
    </section>
  );
}
