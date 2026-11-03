"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { type BoundCopy, type CopyRuleId, type CopySchool, isName } from "@/lib/screening/copy";
import { nameQuery } from "@/lib/screening/filters";
import { sourceValue } from "./source";
import type { Method } from "@/lib/screening/copy/method";
import { fetchTopList, recordText, saveFile, useTopList } from "@/lib/screening/method/export";
import { recordValue } from "@/lib/screening/method/top-csv";
import type { TopRow } from "@/lib/screening/method/top-list";
import type { RuleId } from "@/lib/screening/types";
import { type PlainList, isoDay, listHead, plainCsv } from "@/lib/screening/workspace/plain-list";
import type { TopLength } from "@/lib/screening/workspace/state";

import { RuleSymbol } from "../RuleArea";
import { usePackSheet } from "../views/PackSheet";
import { SheetTabs } from "../views/SheetTabs";
import base from "../screening.module.css";
import styles from "./export.module.css";

const f3 = (value: number) => value.toFixed(3);
const LENGTHS: readonly TopLength[] = [10, 20, 30];
/** How many of the list's schools the plain sheet shows before saying how many more the file holds. */
const PREVIEW = 10;

export interface ExportSheetProps {
  copy: BoundCopy;
  /** The method details' words, when they are on; the plain sheet uses the copy system's words only. */
  method: Method | null;
  rule: CopyRuleId;
  /** In compare mode, the rule the list is compared with. */
  comparedWith: CopyRuleId | null;
  n: TopLength;
  /**
   * The filters on screen. The research file follows the province and district; the API has no remoteness or name
   * filter, so the method sheet shows those as not applied to the file, and the plain sheet says so of the name.
   */
  filters: { prov: string | null; dist: string | null; q: string | null; loc: string | null };
  /** The list on screen, which the plain sheet previews and downloads as it stands. */
  list: PlainList;
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
 * Download the list. The plain sheet previews the list on screen, filter and all, and downloads it as a spreadsheet
 * a director can read: rank, school, province, district and the Why line, after a line naming the method, the date
 * and the data version. The research team's file, the API's own with its method record, is its second choice. With
 * the method details on, the sheet is the research file's: the first 10, 20 or 30 under the rule, previewed from the
 * file, with the formula, the shares, the ids and the fingerprints.
 */
export function ExportSheet(props: ExportSheetProps) {
  const { copy, method, rule, n, schools, layer, onNotify } = props;
  const { TERMS, LAYOUT, STRINGS, HELP } = copy;
  const plain = method === null;
  const place = { province: props.filters.prov, district: props.filters.dist };
  // The plain sheet reads the research file only when asked for it; the method sheet previews it.
  const read = useTopList(rule as RuleId, n, place, !props.pack && !plain);
  const pack = usePackSheet({ copy, method, schools, enabled: props.pack, onNotify });
  const closeButton = useRef<HTMLButtonElement>(null);
  const file = read.data ?? null;
  const list = file?.list ?? null;
  const needFirst = file?.file.rows.some((row) => row.sort_key_primary !== null) ?? false;
  const scoreHead = needFirst ? TERMS.school_need.label : TERMS.score.label;
  const bare = (label: string) => label.replace(/\s*\(\d+\)$/, "");
  const searched = nameQuery(props.filters.q) !== null;
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

  // The plain list's lines and file are made when they are asked for, so they carry the day they were made.
  const rows = props.list.rows;
  const plainRecord = () =>
    [
      listHead(copy, rule, props.list, new Date())[0],
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
  const downloadList = () => {
    const now = new Date();
    const text = plainCsv(
      listHead(copy, rule, props.list, now),
      [LAYOUT.rankHead, LAYOUT.schoolHead, LAYOUT.byProvince, LAYOUT.district, LAYOUT.whyKey],
      rows
    );
    saveFile(text, LAYOUT.listFileName(copy.ruleLabel(rule), isoDay(now), props.list.where), "text/csv");
    onNotify(LAYOUT.afterDownloadPlain);
  };

  // The research file on its own: read when asked for, and its read cancelled if the sheet closes first.
  const [research, setResearch] = useState<"idle" | "loading" | "failed">("idle");
  const researchRead = useRef<AbortController | null>(null);
  useEffect(() => () => researchRead.current?.abort(), []);
  const downloadResearch = async () => {
    researchRead.current?.abort();
    const controller = new AbortController();
    researchRead.current = controller;
    setResearch("loading");
    try {
      const got = await fetchTopList(rule as RuleId, n, place, controller.signal);
      saveFile(got.text, got.name ?? `${rule}.csv`, got.type);
      setResearch("idle");
      onNotify(LAYOUT.afterDownloadList);
    } catch {
      if (!controller.signal.aborted) setResearch("failed");
    }
  };

  const download = () => {
    if (!file) return;
    saveFile(file.text, file.name ?? `${rule}.csv`, file.type);
    onNotify(LAYOUT.afterDownloadList);
  };
  const copyRecord = async () => {
    if (!plain && !file) return;
    try {
      await navigator.clipboard.writeText(plain ? plainRecord() : recordText(file!.file));
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

  const listTable = (
    <table className={styles.table} data-region="export-table">
      <colgroup>
        <col className={styles.colRange} />
        <col />
        <col className={styles.colWhy} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{LAYOUT.rankHead}</th>
          <th scope="col">{LAYOUT.schoolHead}</th>
          <th scope="col">{LAYOUT.whyKey}</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, PREVIEW).map((row) => {
          const where = [row.district, row.province].filter(Boolean).join(", ");
          return (
            <tr key={row.key}>
              <td className={styles.rank}>{row.rank}</td>
              <td className={styles.name}>
                {row.school}
                {where ? <span className={styles.quiet}>{` · ${where}`}</span> : null}
              </td>
              <td className={styles.why}>{row.why}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const pointTable = list ? (
    <table className={styles.table} data-region="export-table">
      <colgroup>
        <col className={styles.colPlace} />
        <col />
        <col className={styles.colProvince} />
        <col className={styles.colScore} />
      </colgroup>
      <thead>
        <tr>
          <th className={styles.num} scope="col">
            {TERMS.rank.label}
          </th>
          <th scope="col">{method?.sheet.school}</th>
          <th scope="col">{LAYOUT.byProvince}</th>
          <th className={styles.num} scope="col">
            {scoreHead}
          </th>
        </tr>
      </thead>
      <tbody>
        {list.point.length === 0 ? (
          <tr>
            <td colSpan={4} className={styles.quiet}>
              {method ? method.sheet.noneTop(n) : LAYOUT.emptyData}
            </td>
          </tr>
        ) : (
          list.point.map((row) => (
            <tr key={row.key}>
              <td className={`${styles.num} ${styles.place}`}>
                {row.place === null ? "" : String(row.place)}
              </td>
              <td className={styles.name}>{nameOf(row)}</td>
              <td className={styles.quiet}>{row.province ?? ""}</td>
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
              {method?.sheet.rangeH}
            </th>
            <th scope="col">{method?.sheet.school}</th>
            <th scope="col">{method?.sheet.missingH}</th>
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
              <td className={styles.quiet}>{TERMS.air_quality.label}</td>
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
      {plain ? null : (
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

  const researchSection = (
    <section className={styles.sec} data-region="research">
      <p className={base.eyebrow}>{LAYOUT.forResearchers}</p>
      <p className={styles.note}>
        {LAYOUT.researchNote(n)}
        {searched ? ` ${LAYOUT.researchNotByName}` : ""}
      </p>
      <div className={styles.researchRow}>
        <button
          type="button"
          className={styles.quietButton}
          disabled={research === "loading"}
          onClick={() => void downloadResearch()}
        >
          {research === "loading" ? LAYOUT.loadingResearch : LAYOUT.researchFile}
        </button>
        {research === "failed" ? (
          <span role="alert" className={styles.researchFailed}>
            {LAYOUT.researchFailed}{" "}
            <button type="button" className={base.linkButton} onClick={() => void downloadResearch()}>
              {LAYOUT.retry}
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );

  let body: ReactNode;
  if (plain)
    body = (
      <>
        <section className={styles.sec}>
          <p className={base.eyebrow}>{LAYOUT.orderedTab}</p>
          {rows.length > 0 ? listTable : null}
          {rows.length > PREVIEW ? (
            <p className={styles.note} data-region="export-more">
              {LAYOUT.listMore(rows.length - PREVIEW)}
            </p>
          ) : null}
        </section>
        {researchSection}
        {record}
        <p className={styles.close}>{STRINGS.caveat}</p>
      </>
    );
  else if (read.isPending)
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
              {props.filters.prov === null && props.filters.loc === null && !searched ? (
                method.sheet.filtersOff
              ) : (
                <>
                  {props.filters.prov !== null ? (
                    <span className={styles.filter}>{method.filter.chipProvince(props.filters.prov)}</span>
                  ) : null}
                  {props.filters.dist !== null ? (
                    <span className={styles.filter}>{method.filter.chipDistrict(props.filters.dist)}</span>
                  ) : null}
                  {props.filters.loc !== null ? (
                    // The file cannot follow this filter, so it shows here marked as not applied, and the sentence
                    // below says so; it is never shown as "None".
                    <span className={styles.filter} data-filter-not-applied="">
                      {method.filter.chipLocality(props.filters.loc)}
                    </span>
                  ) : null}
                  {searched ? (
                    <span className={styles.filter} data-filter-not-applied="">
                      {method.filter.chipName(props.filters.q!.trim().replace(/\s+/g, " "))}
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
          {searched ? <p className={styles.note}>{LAYOUT.researchNotByName}</p> : null}
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
              <SheetTabs copy={copy} plain={plain} pack={props.pack} onTab={props.onTab} />
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
                  ? TERMS.export.label
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
                  ? `${LAYOUT.listLede(rows.length, props.list.status !== null)}${rows.length > 0 ? ` ${LAYOUT.listFirstLine}` : ""}`
                  : `${method.sheet.lede(n, copy.ruleName(rule), hasRanges)}${
                      props.comparedWith ? method.sheet.ledeCompare(copy.ruleName(props.comparedWith)) : ""
                    }`}
            </Dialog.Description>
            {plain && !props.pack && props.list.status ? (
              <p className={styles.note} data-region="export-find">
                {props.list.status}
              </p>
            ) : null}
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
                  disabled={!plain && !file}
                  onClick={() => void copyRecord()}
                >
                  {LAYOUT.copyRecord}
                </button>
                {plain ? null : <span className={styles.hint}>{TERMS.manifest.line}</span>}
                <span className={styles.spacer} />
                {/* The two ways to take the list away, side by side. The printout is the list this sheet shows, on
                    either tab. */}
                {plain ? (
                  <span className={styles.pair}>
                    <button
                      type="button"
                      className={styles.quietButton}
                      data-region="print-list"
                      disabled={rows.length === 0}
                      onClick={() => window.print()}
                    >
                      {LAYOUT.printList}
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={rows.length === 0}
                      onClick={downloadList}
                    >
                      {LAYOUT.downloadList}
                    </button>
                  </span>
                ) : (
                  <button type="button" className={styles.primary} disabled={!file} onClick={download}>
                    {LAYOUT.researchFile}
                  </button>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
