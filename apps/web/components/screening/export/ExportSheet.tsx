"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useRef } from "react";

import { type BoundCopy, type CopyRuleId, type CopySchool, isName } from "@/lib/screening/copy";
import { sourceValue } from "./source";
import type { Method } from "@/lib/screening/copy/method";
import { recordText, saveFile, useTopList } from "@/lib/screening/method/export";
import { recordValue } from "@/lib/screening/method/top-csv";
import type { TopRow } from "@/lib/screening/method/top-list";
import type { RuleId } from "@/lib/screening/types";
import type { TopLength } from "@/lib/screening/workspace/state";

import { RuleSymbol } from "../RuleArea";
import { usePackSheet } from "../views/PackSheet";
import { SheetTabs } from "../views/SheetTabs";
import base from "../screening.module.css";
import styles from "./export.module.css";

const f3 = (value: number) => value.toFixed(3);
const LENGTHS: readonly TopLength[] = [10, 20, 30];

export interface ExportSheetProps {
  copy: BoundCopy;
  /** The method details' words, when they are on; the plain sheet uses the copy system's words only. */
  method: Method | null;
  rule: CopyRuleId;
  /** In compare mode, the rule the list is compared with. */
  comparedWith: CopyRuleId | null;
  n: TopLength;
  /**
   * The method details' filters on screen. The file follows the province; the API has no remoteness filter, so a
   * remoteness filter is shown as not applied to the file. The plain sheet has none: a plain screen is never filtered.
   */
  filters: { prov: string | null; loc: string | null };
  /** The schools of the list on screen, so a name shows in the one display form (R17). */
  schools: ReadonlyMap<string, CopySchool>;
  layer: HTMLElement | null;
  instant: boolean;
  /** The Saved views for meetings tab shows, not the top list. */
  pack: boolean;
  onTab: (pack: boolean) => void;
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
  const plain = method === null;
  const read = useTopList(rule as RuleId, n, plain ? null : props.filters.prov, !props.pack);
  const pack = usePackSheet({ copy, method, schools, enabled: props.pack, onNotify });
  const closeButton = useRef<HTMLButtonElement>(null);
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

  // The file is the API's in both layers: its method record is what lets someone rebuild the list. What the plain
  // sheet names and copies is in plain words; the method sheet keeps the API's name and the technical record.
  const title = LAYOUT.listTitle(n, copy.rulePlainName(rule));
  const plainRecord = () =>
    [
      title,
      ...(
        [
          [TERMS.rule.label, copy.ruleLabel(rule)],
          [TERMS.rule_roles.label, copy.ruleRoleLine(rule)],
          [LAYOUT.shares, copy.ruleExplanation(rule)],
          [bare(TERMS.urgency.label), copy.urgencyNote(rule)],
          [TERMS.rank.label, copy.groupsSentence(rule)],
          [bare(TERMS.queue.label), STRINGS.queueIntro],
          [TERMS.tie_rule.label, TERMS.tie_rule.line],
          [TERMS.source.label, sourceValue(copy)],
        ] as const
      ).map(([label, value]) => `${label}: ${value}`),
      STRINGS.caveat,
    ].join("\n");
  // The plain download is named from the list's length and the rule's plain label; the method sheet keeps the API's.
  const plainName = LAYOUT.topListFileName(n, copy.ruleLabel(rule));
  const download = () => {
    if (!file) return;
    saveFile(file.text, plain ? plainName : (file.name ?? `${rule}.csv`), file.type);
    onNotify(LAYOUT.afterDownloadList);
  };
  const copyRecord = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(plain ? plainRecord() : recordText(file.file));
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
          <th scope="col">{plain ? LAYOUT.schoolHead : method.sheet.school}</th>
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
            <th scope="col">{plain ? LAYOUT.schoolHead : method.sheet.school}</th>
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
      <dd>{sourceValue(copy)}</dd>
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
        {LAYOUT.loadingTopList}
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
            <dd data-region="export-filters">
              {props.filters.prov === null && props.filters.loc === null ? (
                method.sheet.filtersOff
              ) : (
                <>
                  {props.filters.prov !== null ? (
                    <span className={styles.filter}>{method.filter.chipProvince(props.filters.prov)}</span>
                  ) : null}
                  {props.filters.loc !== null ? (
                    // The file cannot follow this filter, so it shows here marked as not applied, and the sentence
                    // below says so; it is never shown as "None".
                    <span className={styles.filter} data-filter-not-applied="">
                      {method.filter.chipLocality(props.filters.loc)}
                    </span>
                  ) : null}
                </>
              )}
            </dd>
          </dl>
          {props.filters.loc !== null ? (
            <p className={styles.note} data-region="export-filter-note">
              {LAYOUT.fileNotByRemoteness}
            </p>
          ) : null}
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
              <SheetTabs copy={copy} pack={props.pack} onTab={props.onTab} />
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
              {props.pack
                ? pack.title
                : plain
                  ? LAYOUT.listTitle(n, copy.rulePlainName(rule))
                  : method.segments
                      .sheetTitle(n, copy.ruleShortName(rule))
                      .map((part, index) =>
                        isName(part) ? <em key={index}>{part.name}</em> : <span key={index}>{part}</span>
                      )}
            </Dialog.Title>
            <Dialog.Description id="screening-export-lede" className={styles.lede}>
              {props.pack
                ? pack.lede
                : plain
                  ? `${TERMS.shortlist.line} ${TERMS.shortlist.help}`
                  : `${method.sheet.lede(n, copy.ruleName(rule), hasRanges)}${
                      props.comparedWith ? method.sheet.ledeCompare(copy.ruleName(props.comparedWith)) : ""
                    }`}
            </Dialog.Description>
            {props.pack ? pack.body : body}
          </div>
          <div className={styles.foot}>
            {props.pack ? (
              pack.foot
            ) : (
              <>
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
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
