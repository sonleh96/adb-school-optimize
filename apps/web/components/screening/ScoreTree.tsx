/**
 * The fixed diagram of how much each part counts towards the score of a rule, as a nested list. Each item names a
 * part and its share in words, beside a bar as long as that share of the whole score. A part made of others has
 * them nested beneath it, and its bar is split into theirs. Every bar sits on one scale, so lengths compare across
 * levels, and a last row as long as the whole score shows the parts end to end. A need-first rule has no score to
 * split, so it gets its one line instead.
 *
 * The words never state a total that the shares listed under it do not add up to. A top part's share is written as
 * a percent of the score; a nested part's as a share of the part it sits under ("a fifth of school need"), so no
 * one adds rounded shares up to its parent; and the last row states 100% only when the written shares reach it.
 *
 * Nothing in it can be pointed at, focused or moved, because the shares are fixed policy choices, not settings. The
 * bars are for sight only: the words carry every share for a screen reader, and nothing shows only on hover.
 */
import { type BoundCopy, isCopyRuleId } from "@/lib/screening/copy";
import { lowerFirst } from "@/lib/screening/copy/format";
import { SCORE_TREE } from "@/lib/screening/copy/tree";
import {
  type Branch,
  INPUT_TERM,
  NEED_PART_TERM,
  type Part,
  type Share,
  WHOLE,
  percentOf,
  percentText,
  scoreTreeOf,
  shareOf,
  writtenTotal,
} from "@/lib/screening/score-tree";
import type { Rule } from "@/lib/screening/types";

import styles from "./score-tree.module.css";

function nameOf(copy: BoundCopy, part: Part): string {
  switch (part.kind) {
    case "input":
      return copy.TERMS[INPUT_TERM[part.input]].label;
    case "need-part":
      return copy.TERMS[NEED_PART_TERM[part.part]].label;
    case "combined":
      return SCORE_TREE.combined;
    case "largest":
      return SCORE_TREE.largest(part.of.map((input) => lowerFirst(copy.TERMS[INPUT_TERM[input]].label)));
  }
}

/** A part's share in words: of the score at the top, else of the part it sits under. */
function shareWords(branch: Branch, parent: Branch | null): string {
  if (parent === null) return SCORE_TREE.share(percentText(branch.share));
  // School need is the plain mean of its five parts; the combined factors add theirs up.
  if (parent.part.kind === "combined")
    return SCORE_TREE.ofCombined(percentText(shareOf(branch.share, parent.share)));
  return SCORE_TREE.fifthOfNeed;
}

const keyOf = (part: Part): string =>
  part.kind === "input" ? part.input : part.kind === "need-part" ? part.part : part.kind;

/** One part's words and bar. A bar with parts is split into theirs, each as long as its share of the whole. */
function Row({
  name,
  words,
  share,
  parts,
}: {
  name: string;
  words: string | null;
  share: Share;
  parts: readonly Branch[];
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>
        <span className={styles.name}>{name}</span>
        {words === null ? null : (
          <>
            {" "}
            <span className={styles.share}>{words}</span>
          </>
        )}
      </span>
      <span className={styles.scale} aria-hidden="true">
        <span className={styles.bar} style={{ width: `${percentOf(share)}%` }}>
          {parts.map((part) => (
            <span
              key={keyOf(part.part)}
              className={styles.segment}
              style={{ flexGrow: percentOf(shareOf(part.share, share)) }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

function Item({ copy, branch, parent }: { copy: BoundCopy; branch: Branch; parent: Branch | null }) {
  return (
    <li>
      <Row
        name={nameOf(copy, branch.part)}
        words={shareWords(branch, parent)}
        share={branch.share}
        parts={branch.children}
      />
      {branch.children.length > 0 ? (
        <ul role="list">
          {branch.children.map((child) => (
            <Item key={keyOf(child.part)} copy={copy} branch={child} parent={branch} />
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
  if (tree.kind === "need-first")
    return (
      <figure className={styles.tree} data-region="score-tree" data-rule={rule.rule_id}>
        <figcaption className={styles.caption}>
          <span className={styles.title}>{SCORE_TREE.title}</span>
        </figcaption>
        <p className={styles.line}>{copy.ruleOneLine(rule.rule_id)}</p>
      </figure>
    );
  const total = writtenTotal(tree.branches.map((branch) => branch.share));
  return (
    <figure className={styles.tree} data-region="score-tree" data-rule={rule.rule_id}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{SCORE_TREE.title}</span>
        <span className={styles.lede}>{SCORE_TREE.lede(copy.ruleName(rule.rule_id))}</span>
      </figcaption>
      {/* The role is the list's own: WebKit stops announcing a list once its markers are gone. */}
      <ul className={styles.list} role="list">
        {tree.branches.map((branch) => (
          <Item key={keyOf(branch.part)} copy={copy} branch={branch} parent={null} />
        ))}
      </ul>
      <div className={styles.whole} data-row="whole">
        <Row
          name={SCORE_TREE.whole}
          words={total === null ? null : SCORE_TREE.share(total)}
          share={WHOLE}
          parts={tree.branches}
        />
      </div>
      <p className={styles.scaleNote}>{SCORE_TREE.scale}</p>
    </figure>
  );
}
