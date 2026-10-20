"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useRef } from "react";

import type { BoundCopy, CopyRuleId, ListedSchool } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { recordText, saveFile, useTopList } from "@/lib/screening/method/export";
import { recordValue } from "@/lib/screening/method/top-csv";
import type { TopRow } from "@/lib/screening/method/top-list";
import type { RuleId } from "@/lib/screening/types";
import type { TopLength } from "@/lib/screening/workspace/state";

import { RuleSymbol } from "../RuleArea";
import base from "../screening.module.css";
import styles from "./export.module.css";

const f3 = (value: number) => value.toFixed(3);
const SENTINEL = "\u0000";
const LENGTHS: readonly TopLength[] = [10, 20, 30];

/**
 * A copy string that sets part of itself in italics with `<em>` around a name, rendered without writing HTML: the
 * string is built around a placeholder, its `<em>` pair becomes an element, and the name goes back in as text.
 */
function Emphasised({ build, name }: { build: (name: string) => string; name: string }) {
  const text = build(SENTINEL);
  const parts = text.split(/<em>|<\/em>/);
  return (
    <>
      {parts.map((part, index) => {
        const words = part.split(SENTINEL).join(name);
        return index % 2 === 1 ? <em key={index}>{words}</em> : <span key={index}>{words}</span>;
      })}
    </>
  );
}

export interface ExportSheetProps {
  copy: BoundCopy;
  /** The method details' words, when they are on; the plain sheet uses the copy system's words only. */
  method: Method | null;
  rule: CopyRuleId;
  /** In compare mode, the rule the list is compared with. */
  comparedWith: CopyRuleId | null;
  n: TopLength;
  /** The schools of the list on screen, so a name shows in the one display form (R17). */
  schools: ReadonlyMap<string, ListedSchool>;
  layer: HTMLElement | null;
  instant: boolean;
  onLength: (n: TopLength) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}

/**
 * Download the top list: the first 10, 20 or 30 of the list under the rule on screen, previewed from the file the API
 * writes, with its method record, and downloaded as that same file. The plain sheet says it all in the copy system's
 * words; with the method details on it keeps the formula, the shares, the ids and the fingerprints.
 */
export function ExportSheet(props: ExportSheetProps) {
  const { copy, method, rule, n, schools, layer, onNotify } = props;
  const { TERMS, LAYOUT, STRINGS, HELP } = copy;
  const read = useTopList(rule as RuleId, n, true);
  const closeButton = useRef<HTMLButtonElement>(null);
  const plain = method === null;
  const file = read.data ?? null;
  const list = file?.list ?? null;
  const needFirst = file?.file.rows.some((row) => row.sort_key_primary !== null) ?? false;
  const scoreHead = needFirst ? TERMS.school_need.label : TERMS.score.label;
  const bare = (label: string) => label.replace(/\s*\(\d+\)$/, "");
  const nameOf = (row: TopRow) => {
    const school = schools.get(row.key);
    return school ? copy.distinctName(school) : copy.displayName({ name: row.name });
  };
  const scoreOf = (row: TopRow) =>
    row.kind === "point"
      ? needFirst && row.need !== null
        ? f3(row.need)
        : row.score !== null
          ? f3(row.score)
          : ""
      : needFirst && row.need !== null
        ? f3(row.need)
        : row.scoreLower !== null && row.scoreUpper !== null
          ? LAYOUT.valueRange(f3(row.scoreLower), f3(row.scoreUpper))
          : "";
  const rangeText = (row: TopRow) =>
    row.best === null || row.worst === null
      ? ""
      : row.best === row.worst
        ? copy.ordinal(row.best)
        : LAYOUT.placeRange(copy.ordinal(row.best), copy.ordinal(row.worst));

  const download = () => {
    if (!file) return;
    saveFile(file.text, file.name ?? `${rule}.csv`, file.type);
    onNotify(LAYOUT.afterDownloadList);
  };
  const copyRecord = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(recordText(file.file));
      onNotify(LAYOUT.recordCopied);
    } catch {
      onNotify(LAYOUT.copyNotDone);
    }
  };

  const lengths = (
    <div className={styles.size}>
      <div className={styles.seg} role="group" aria-label={TERMS.shortlist_size.label}>
        {LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            aria-pressed={n === length}
            onClick={() => props.onLength(length)}
          >
            {length}
          </button>
        ))}
      </div>
      <span className={styles.sizeNote}>{TERMS.shortlist_size.line}</span>
    </div>
  );

  const pointTable = list ? (
    <table className={styles.table} data-region="export-table">
      <colgroup>
        <col className={styles.colPlace} />
        <col />
        {plain ? null : <col className={styles.colProvince} />}
        <col className={styles.colScore} />
      </colgroup>
      <thead>
        <tr>
          <th className={styles.num} scope="col">
            {TERMS.rank.label}
          </th>
          {plain ? <td /> : <th scope="col">{method.sheet.school}</th>}
          {plain ? null : <th scope="col">{LAYOUT.byProvince}</th>}
          <th className={styles.num} scope="col">
            {scoreHead}
          </th>
        </tr>
      </thead>
      <tbody>
        {list.point.length === 0 ? (
          <tr>
            <td colSpan={plain ? 3 : 4} className={styles.quiet}>
              {method ? method.sheet.noneTop(n) : LAYOUT.emptyData}
            </td>
          </tr>
        ) : (
          list.point.map((row) => (
            <tr key={row.key}>
              <td className={`${styles.num} ${styles.place}`}>
                {row.place === null ? "" : plain ? copy.ordinal(row.place) : String(row.place)}
              </td>
              <td className={styles.name}>
                {nameOf(row)}
                {plain && row.province ? <span className={styles.quiet}>{` · ${row.province}`}</span> : null}
              </td>
              {plain ? null : <td className={styles.quiet}>{row.province ?? ""}</td>}
              <td className={styles.num}>{scoreOf(row)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  ) : null;

  const rangeTable =
    list && list.range.length > 0 ? (
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colRange} />
          <col />
          <col className={styles.colMissing} />
          <col className={styles.colScoreRange} />
        </colgroup>
        <thead>
          <tr>
            <th className={styles.num} scope="col">
              {plain ? TERMS.rank_range.label : method.sheet.rangeH}
            </th>
            {plain ? <td /> : <th scope="col">{method.sheet.school}</th>}
            <th scope="col">{plain ? TERMS.air_quality.label : method.sheet.missingH}</th>
            <th className={styles.num} scope="col">
              {scoreHead}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.range.map((row) => (
            <tr key={row.key}>
              <td className={`${styles.num} ${styles.range}`}>{rangeText(row)}</td>
              <td className={styles.name}>{nameOf(row)}</td>
              <td className={styles.quiet}>{plain ? STRINGS.noReading : TERMS.air_quality.label}</td>
              <td className={styles.num}>{scoreOf(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : null;

  const generated = file ? recordValue(file.file, "generated_at") : null;
  const shared = (
    <>
      <dt>{plain ? TERMS.rank.label : method.sheet.pointRanks}</dt>
      <dd>{copy.groupsSentence(rule)}</dd>
      <dt>{bare(TERMS.queue.label)}</dt>
      <dd>{STRINGS.queueIntro}</dd>
      <dt>{TERMS.tie_rule.label}</dt>
      <dd>{TERMS.tie_rule.line}</dd>
      {plain ? null : (
        <>
          <dt>{method.sheet.normalization}</dt>
          <dd>{method.sheet.normalizationV(copy.counts.all)}</dd>
        </>
      )}
      <dt>{TERMS.source.label}</dt>
      <dd>{STRINGS.source}</dd>
      {plain || !generated ? null : (
        <>
          <dt>{method.sheet.fixture}</dt>
          <dd className={styles.mono}>
            {method.sheet.generatedAt(generated.replace("T", " ").replace(/:\d\dZ$/, ""))}
          </dd>
        </>
      )}
    </>
  );
  const fingerprints = file ? file.file.record.filter((line) => line.key.endsWith("_sha256")) : [];

  const record = (
    <section className={styles.sec} data-region="method-record" aria-label={TERMS.manifest.label}>
      <p className={base.eyebrow}>{TERMS.manifest.label}</p>
      <p className={styles.note}>{TERMS.manifest.line}</p>
      <dl className={styles.dl}>
        <dt>{TERMS.rule.label}</dt>
        <dd>
          {plain ? null : <RuleSymbol symbol={copy.ruleSymbol(rule)} className={styles.sym} />}
          {copy.ruleLabel(rule)}
          {plain ? null : <span className={styles.mono}> {rule}</span>}
        </dd>
        <dt>{TERMS.rule_roles.label}</dt>
        <dd>{copy.ruleRoleLine(rule)}</dd>
        {plain ? (
          <>
            <dt>{LAYOUT.shares}</dt>
            <dd>{copy.ruleExplanation(rule)}</dd>
          </>
        ) : (
          <>
            <dt>{method.sheet.formula}</dt>
            <dd className={styles.mono}>{file ? recordValue(file.file, "formula") : ""}</dd>
            <dt>{method.sheet.weights}</dt>
            <dd>{file ? (recordValue(file.file, "weights") ?? method.sheet.noWeights) : ""}</dd>
          </>
        )}
        <dt>{plain ? bare(TERMS.urgency.label) : method.sheet.urgency}</dt>
        <dd>{copy.urgencyNote(rule)}</dd>
        {shared}
      </dl>
      {plain ? (
        <p className={styles.note}>{LAYOUT.fingerprints(fingerprints.length)}</p>
      ) : (
        <ul className={styles.hashes}>
          {fingerprints.map((line) => (
            <li key={line.key} title={`${line.key} ${line.value}`}>
              <span>{line.key}</span>
              <span className={styles.mono}>{`${line.value.slice(0, 12)}…${line.value.slice(-4)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  let body: ReactNode;
  if (read.isPending)
    body = (
      <p className={base.state} role="status">
        {LAYOUT.loading}
      </p>
    );
  else if (read.isError || !list)
    body = (
      <div className={base.fullState} role="alert">
        <p>{LAYOUT.loadFailed}</p>
        <button type="button" className={base.retryButton} onClick={() => void read.refetch()}>
          {LAYOUT.retry}
        </button>
      </div>
    );
  else if (plain)
    body = (
      <>
        <section className={styles.sec}>
          <p className={base.eyebrow}>{TERMS.shortlist_size.label}</p>
          {lengths}
          {pointTable}
        </section>
        {rangeTable ? (
          <section className={styles.sec}>
            <p className={base.eyebrow}>{TERMS.rank_range.label}</p>
            {rangeTable}
            <p className={styles.note}>{copy.scope(rule).listOrder}</p>
          </section>
        ) : null}
        {record}
        <p className={styles.close}>{STRINGS.caveat}</p>
      </>
    );
  else
    body = (
      <>
        <section className={styles.sec}>
          <p className={base.eyebrow}>{TERMS.shortlist.label}</p>
          <dl className={styles.dl}>
            <dt>{TERMS.shortlist_size.label}</dt>
            <dd>{lengths}</dd>
            <dt>{TERMS.filters.label}</dt>
            <dd>{method.sheet.filtersOff}</dd>
          </dl>
          {pointTable}
        </section>
        <section className={styles.sec}>
          <p className={base.eyebrow}>{method.sheet.possible(n)}</p>
          {rangeTable ?? <p className={styles.note}>{method.sheet.possibleNone(n)}</p>}
          {rangeTable ? <p className={styles.note}>{copy.scope(rule).listOrder}</p> : null}
        </section>
        {record}
        <section className={styles.sec}>
          <p className={base.eyebrow}>{method.sheet.limits}</p>
          <p className={styles.limits}>{method.sheet.limitsV}</p>
        </section>
      </>
    );

  const hasRanges = (list?.range.length ?? 0) > 0;
  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : props.onClose())}>
      <Dialog.Portal container={layer}>
        <Dialog.Overlay className={styles.scrim} data-instant={props.instant || undefined} />
        <Dialog.Content
          className={styles.sheet}
          data-region="export-sheet"
          data-instant={props.instant || undefined}
          aria-describedby="screening-export-lede"
          // Escape closes the sheet only, not the school card behind it: the innermost layer first.
          onKeyDown={(event) => {
            if (event.key === "Escape") event.stopPropagation();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButton.current?.focus();
          }}
        >
          <div className={styles.scroll}>
            <div className={styles.top}>
              <span className={base.eyebrow}>{TERMS.shortlist.label}</span>
              <Dialog.Close asChild>
                <button
                  ref={closeButton}
                  type="button"
                  className={styles.closeButton}
                  aria-label={HELP.close}
                  title={HELP.close}
                >
                  <X size={16} aria-hidden />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Title className={styles.title}>
              {plain ? (
                LAYOUT.listTitle(n, copy.ruleName(rule))
              ) : (
                <Emphasised build={(name) => method.sheet.title(n, name)} name={copy.ruleShortName(rule)} />
              )}
            </Dialog.Title>
            <Dialog.Description id="screening-export-lede" className={styles.lede}>
              {plain
                ? `${TERMS.shortlist.line} ${TERMS.shortlist.help}`
                : `${method.sheet.lede(n, copy.ruleName(rule), hasRanges)}${
                    props.comparedWith ? method.sheet.ledeCompare(copy.ruleName(props.comparedWith)) : ""
                  }`}
            </Dialog.Description>
            {body}
          </div>
          <div className={styles.foot}>
            <button
              type="button"
              className={styles.quietButton}
              disabled={!file}
              onClick={() => void copyRecord()}
            >
              {LAYOUT.copyRecord}
            </button>
            {plain ? null : <span className={styles.hint}>{TERMS.manifest.line}</span>}
            <span className={styles.spacer} />
            <button type="button" className={styles.primary} disabled={!file} onClick={download}>
              {TERMS.export.label}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
