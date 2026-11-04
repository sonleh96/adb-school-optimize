/**
 * The fixed diagram of how much each part counts towards the score of a rule, as a nested list. Each item names a
 * part and its share in words, beside a bar as long as that share of the whole score. A part made of others has
 * them nested beneath it, and its bar is split into theirs. Every bar sits on one scale, so lengths compare across
 * levels, and a last row as long as the whole score shows the parts end to end. A need-first rule has no score to
 * split, so it gets its one line instead.
 *
 * Nothing in it can be pointed at, focused or moved, because the shares are fixed policy choices, not settings. The
 * bars are for sight only: the words carry every share for a screen reader, and nothing shows only on hover.
 */
import { type BoundCopy, type TermKey, isCopyRuleId } from "@/lib/screening/copy";
import { lowerFirst } from "@/lib/screening/copy/format";
import { SCORE_TREE } from "@/lib/screening/copy/tree";
import {
  type Branch,
  type Input,
  type NeedPart,
  type Part,
  type Share,
  WHOLE,
  percentOf,
  scoreTreeOf,
} from "@/lib/screening/score-tree";
import type { Rule } from "@/lib/screening/types";

import styles from "./score-tree.module.css";

/** The glossary term of each input and each part of school need, whose label the rest of the tool uses. */
const INPUT_TERM = {
  N: "school_need",
  A: "area_context",
  U: "urgency",
  R: "reach",
  Q: "air_quality",
  E: "emissions",
  L: "land_cover",
} as const satisfies Record<Input, TermKey>;
const PART_TERM = {
  permanent_classroom_deficit: "need_classrooms",
  teacher_housing_deficit: "need_housing",
  facility_presence_deficit: "need_facilities",
  service_deficit: "need_services",
  locality_disadvantage: "need_locality",
} as const satisfies Record<NeedPart, TermKey>;

function nameOf(copy: BoundCopy, part: Part): string {
  switch (part.kind) {
    case "input":
      return copy.TERMS[INPUT_TERM[part.input]].label;
    case "need-part":
      return copy.TERMS[PART_TERM[part.part]].label;
    case "combined":
      return SCORE_TREE.combined;
    case "largest":
      return SCORE_TREE.largest(part.of.map((input) => lowerFirst(copy.TERMS[INPUT_TERM[input]].label)));
  }
}

const keyOf = (part: Part): string =>
  part.kind === "input" ? part.input : part.kind === "need-part" ? part.part : part.kind;

/** One part's words and bar. A bar with parts is split into theirs, each as long as its share of the whole. */
function Row({
  name,
  note,
  share,
  parts,
}: {
  name: string;
  note?: string;
  share: Share;
  parts: readonly Branch[];
}) {
  const { value, whole } = percentOf(share);
  return (
    <div className={styles.row}>
      <span className={styles.label}>
        <span className={styles.head}>
          <span className={styles.name}>{name}</span>{" "}
          <span className={styles.share}>{SCORE_TREE.share(Math.round(value), whole)}</span>
        </span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </span>
      <span className={styles.scale} aria-hidden="true">
        <span className={styles.bar} style={{ width: `${value}%` }}>
          {parts.map((part) => (
            <span
              key={keyOf(part.part)}
              className={styles.segment}
              style={{ flexGrow: (part.share.n * share.d) / (part.share.d * share.n) }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

function Item({ copy, branch }: { copy: BoundCopy; branch: Branch }) {
  const averaged = branch.part.kind === "input" && branch.part.input === "N" && branch.children.length > 0;
  return (
    <li>
      <Row
        name={nameOf(copy, branch.part)}
        note={averaged ? SCORE_TREE.needParts : undefined}
        share={branch.share}
        parts={branch.children}
      />
      {branch.children.length > 0 ? (
        <ul role="list">
          {branch.children.map((child) => (
            <Item key={keyOf(child.part)} copy={copy} branch={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The diagram for one rule from the API, or nothing when the API does not say how the rule combines its inputs. */
export function ScoreTree({ copy, rule }: { copy: BoundCopy; rule: Rule }) {
  const tree = scoreTreeOf(rule);
  if (!tree || !isCopyRuleId(rule.rule_id)) return null;
  return (
    <figure className={styles.tree} data-region="score-tree" data-rule={rule.rule_id}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{SCORE_TREE.title}</span>
        {tree.kind === "sum" ? (
          <span className={styles.lede}>{SCORE_TREE.lede(copy.ruleName(rule.rule_id))}</span>
        ) : null}
      </figcaption>
      {tree.kind === "need-first" ? (
        <p className={styles.line}>{copy.ruleOneLine(rule.rule_id)}</p>
      ) : (
        <>
          {/* The role is the list's own: WebKit stops announcing a list once its markers are gone. */}
          <ul className={styles.list} role="list">
            {tree.branches.map((branch) => (
              <Item key={keyOf(branch.part)} copy={copy} branch={branch} />
            ))}
          </ul>
          <div className={styles.whole} data-row="whole">
            <Row name={SCORE_TREE.whole} share={WHOLE} parts={tree.branches} />
          </div>
          <p className={styles.scaleNote}>{SCORE_TREE.scale}</p>
        </>
      )}
    </figure>
  );
}
