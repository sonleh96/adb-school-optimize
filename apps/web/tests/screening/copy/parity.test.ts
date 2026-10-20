/**
 * Local-only parity: the port must say exactly what the design prototype's `copy.js` says for the same records.
 *
 * It needs the design folder, which holds real school data and is never committed:
 *   RISE_PNG_DESIGN_ROOT=/Users/sonle/Documents/work/ADB/adb-school-optimize/.audit-work/design/ui-20261020 npm test
 * Without it the suite is skipped.
 *
 * Failure modes this guards, each by comparing the two implementations on the same input:
 *  1. A sentence is reworded or mistyped while porting. Every string the two produce is compared character by character.
 *  2. A branch is lost. Every function runs for every school under every rule, on the design fixture's schools and on
 *     the four worst-case datasets (blank names, ties, twins, empty, one school, 1,284 schools).
 *  3. A count leaks. The functions run both bound to the data's counts (`copyFor`) and with no counts (module exports).
 *  4. A function that threw now returns, or the reverse. The outcome (a value or a throw) is compared too.
 */
// @vitest-environment node
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as port from "@/lib/screening/copy";
import type { CopyData } from "@/lib/screening/copy";
import * as later from "@/lib/screening/copy/later";

import { school, withLater } from "./helpers";
import {
  type Api,
  DATASET_DIRS,
  type Dataset,
  ROOT,
  flush,
  loadDatasets,
  loadPrototype,
  mismatches,
  prototypeValue,
  ready,
  run,
  same,
  sameOutcome,
  show,
  tally,
} from "./parity-support";

const suite = describe.skipIf(!ready);

/** Everything the port exports, the part that loads on demand included, as the prototype exports it. */
const everything = { ...port, ...later };

let proto: Api;
let datasets: Dataset[] = [];

beforeAll(async () => {
  if (!ready) return;
  proto = loadPrototype(path.join(ROOT as string, "prototype/shared/copy.js"));
  datasets = loadDatasets();
});

afterAll(() => {
  if (ready)
    console.log(
      `copy parity: ${tally.strings} strings compared over ${tally.calls} calls (${tally.bothThrew} threw on both sides)`
    );
});

suite("the port says what the prototype says [needs RISE_PNG_DESIGN_ROOT]", () => {
  it("exports every name the prototype exports", () => {
    // COUNTS is the design fixture's own sizes; the port keeps no counts in module-level copy.
    const missing = Object.keys(proto).filter((k) => k !== "COUNTS" && !(k in everything));
    expect(missing).toEqual([]);
  });

  it("holds the same fixed copy with no data bound", () => {
    for (const k of [
      "RULE_IDS",
      "DEFAULT_RULE",
      "PROPOSED_RULE",
      "TERMS",
      "GLOSSARY_GROUPS",
      "STRINGS",
      "LAYOUT",
      "KEYS",
      "HELP",
      "IDEAS",
      "HOW_IT_WORKS",
      "FIRST_QUESTIONS",
      "GUIDE",
      "BANNED",
    ]) {
      same(k, prototypeValue(k, proto[k]), (everything as Api)[k]);
    }
    flush();
  });

  it("builds the same copy for every shape of counts", () => {
    const full = {
      all: 5,
      complete: 2,
      range: 1,
      ranked: 3,
      queue: 2,
      urgencyZero: 3,
      emissionsNone: 1,
      airMissing: 1,
      remotenessOnly: 1,
      flagged: 1,
    };
    const bags: (Record<string, number> | undefined)[] = [
      undefined,
      {},
      full,
      { ...full, urgencyZero: 0 },
      { ...full, urgencyZero: 5 },
      { ...full, urgencyZero: 2 },
      { ...full, range: 0, ranked: 2 },
      { ...full, range: 4, ranked: 6, queue: 1, flagged: 9, airMissing: 4 },
      { ...full, complete: 1, ranked: 2, queue: 1, all: 3 },
      {
        all: 0,
        complete: 0,
        range: 0,
        ranked: 0,
        queue: 0,
        urgencyZero: 0,
        emissionsNone: 0,
        airMissing: 0,
        remotenessOnly: 0,
        flagged: 0,
      },
      {
        all: 2468,
        complete: 2000,
        range: 12,
        ranked: 2012,
        queue: 456,
        urgencyZero: 2100,
        emissionsNone: 300,
        airMissing: 12,
        remotenessOnly: 80,
        flagged: 20,
      },
      { range: 1 },
      { range: 1, queue: 1, all: 8, ranked: 7 },
      { complete: 7 },
      { urgencyZero: 1, all: 5 },
    ];
    bags.forEach((bag, i) => {
      const tag = `bag ${i}`;
      same(`${tag} buildTerms`, prototypeValue("TERMS", proto.buildTerms(bag), bag), port.buildTerms(bag));
      same(
        `${tag} buildStrings`,
        prototypeValue("buildStrings", proto.buildStrings(bag)),
        port.buildStrings(bag)
      );
      for (const reads of [undefined, { urgency: false, readings: true }, { urgency: true, readings: false }])
        same(
          `${tag} buildScope ${JSON.stringify(reads)}`,
          proto.buildScope(bag, reads),
          port.buildScope(bag, reads)
        );
      same(`${tag} buildIdeas`, proto.buildIdeas(bag), port.buildIdeas(bag));
      same(`${tag} buildHow`, proto.buildHow(bag), later.buildHow(bag));
      same(
        `${tag} buildHow(example)`,
        proto.buildHow(bag, "An example."),
        later.buildHow(bag, "An example.")
      );
      same(`${tag} groupsSentence`, proto.groupsSentence(bag), port.groupsSentence(bag));
      same(`${tag} urgencyDefinition`, proto.urgencyDefinition(bag), port.urgencyDefinition(bag));
      for (const r of proto.RULE_IDS)
        same(
          `${tag} urgencyNote(${r})`,
          proto.urgencyNote(r, { counts: bag }),
          port.urgencyNote(r, { counts: bag })
        );
    });
    same("buildQuestions", proto.buildQuestions(), later.buildQuestions());
    same(
      "buildQuestions(trust)",
      proto.buildQuestions(proto.buildIdeas({}), "Trust."),
      later.buildQuestions(port.buildIdeas({}), "Trust.")
    );
    flush();
  });

  it("words a held-back school's counts the same way, whether blank, zero or negative", () => {
    const cases = [
      { gate: ["permanent_classroom_deficit"], condition: { classrooms_total: -2 } },
      { gate: ["permanent_classroom_deficit"], condition: { classrooms_total: 0 } },
      { gate: ["permanent_classroom_deficit"], condition: { classrooms_permanent: null } },
      { gate: ["permanent_classroom_deficit"], condition: {} },
      {
        gate: ["teacher_housing_deficit", "negative_stock_value"],
        condition: { teachers: -3, libraries: -1 },
      },
      { gate: ["teacher_housing_deficit"], condition: { teacher_houses: null } },
      { gate: ["teacher_housing_deficit"], condition: {} },
      { gate: ["negative_stock_value"], condition: { teachers: -3 } },
      { gate: ["negative_stock_value"], condition: { libraries: -1 } },
    ];
    for (const [i, c] of cases.entries()) {
      const x = school({ id: `n${i}`, cohort: "queue", gate: c.gate as never, condition: c.condition });
      for (const fn of ["missingLabels", "missingSentences", "missingSentence"])
        sameOutcome(
          `${fn} ${JSON.stringify(c)}`,
          run(() => proto[fn](x, "additive_u")),
          run(() => (port as Api)[fn](x, "additive_u"))
        );
      for (const key of ["classrooms", "housing"])
        sameOutcome(
          `missingValueNote ${key} ${JSON.stringify(c)}`,
          run(() => proto.missingValueNote(x, key)),
          run(() => (port as Api).missingValueNote(x, key))
        );
    }
    flush();
  });

  it("words an input the record holds but cannot be read the same way, not as a blank", () => {
    const cases = [
      { cohort: "complete", unreadable: ["classrooms_total", "aqi"] },
      { cohort: "interval", unreadable: ["power_source"] },
      { cohort: "queue", gate: ["permanent_classroom_deficit"], unreadable: ["classrooms_total"] },
      {
        cohort: "queue",
        gate: ["teacher_housing_deficit", "service_deficit"],
        unreadable: ["teachers", "water_source"],
      },
      { cohort: "queue", gate: ["facility_presence_deficit"], unreadable: ["libraries", "workshops"] },
      { cohort: "queue", gate: ["urgency_unknown"], unreadable: ["urgency"] },
    ];
    for (const [i, c] of cases.entries()) {
      const x = {
        ...school({ id: `u${i}`, cohort: c.cohort as never, gate: (c.gate ?? []) as never, blank: ["aqi"] }),
        unreadable: c.unreadable,
      };
      for (const fn of ["missingLabels", "missingSentences", "missingSentence"])
        sameOutcome(
          `${fn} ${JSON.stringify(c)}`,
          run(() => proto[fn](x, "additive_u")),
          run(() => (port as Api)[fn](x, "additive_u"))
        );
      for (const key of ["classrooms", "housing", "facilities", "services", "air"])
        sameOutcome(
          `missingValueNote ${key} ${JSON.stringify(c)}`,
          run(() => proto.missingValueNote(x, key)),
          run(() => (port as Api).missingValueNote(x, key))
        );
    }
    flush();
  });

  it("says an urgency value that is known but not loaded is recorded, and prints one that is loaded", () => {
    const base = school({ id: "u" });
    const rest = Object.fromEntries(Object.entries(base.components).filter(([k]) => k !== "U"));
    for (const x of [base, { ...base, components: rest }])
      sameOutcome(
        `inputSentence urgency, U ${"U" in x.components ? "loaded" : "not loaded"}`,
        run(() => proto.inputSentence(x, "urgency")),
        run(() => (port as Api).inputSentence(x, "urgency"))
      );
    flush();
  });

  it("formats numbers the same way", () => {
    const nums = [
      0,
      1,
      2,
      3,
      4,
      9,
      10,
      11,
      12,
      13,
      14,
      21,
      22,
      23,
      24,
      99,
      100,
      101,
      102,
      111,
      112,
      113,
      150,
      199,
      333,
      1001,
      1500,
      0.5,
      1.5,
      -1,
      Number.NaN,
    ];
    for (const n of nums) {
      same(
        `ordinal(${n})`,
        run(() => proto.ordinal(n)),
        run(() => port.ordinal(n))
      );
      same(`formatCount(${n})`, proto.formatCount(n), port.formatCount(n));
    }
    for (const n of [0, 1, 7, 99, 100, 165178, 165000.4, 999999, 1234567, 0.0004, 0.5, 12345.678])
      same(
        `formatApprox(${n})`,
        run(() => proto.formatApprox(n)),
        run(() => port.formatApprox(n))
      );
    for (const f of [0, 0.075, 0.1, 0.25, 0.3333, 0.5, 0.9996, 1, 0.00049, 0.0005, 0.12345, 0.61078])
      same(`formatPercent(${f})`, proto.formatPercent(f), port.formatPercent(f));
    for (const s of ["  Alder  Junior High   School ", "", " ", "A", "Lumi "])
      same(`cleanName(${show(s)})`, proto.cleanName(s), port.cleanName(s));
    flush();
  });

  it("describes every rule the same way", () => {
    for (const id of proto.RULE_IDS) {
      for (const fn of [
        "ruleLabel",
        "ruleShortName",
        "ruleOneLine",
        "ruleExplanation",
        "ruleRole",
        "ruleSource",
        "ruleRoleLine",
        "ruleRelation",
        "ruleName",
        "ruleSymbol",
        "ruleUsesUrgency",
      ]) {
        same(`${fn}(${id})`, proto[fn](id), (port as Api)[fn](id));
      }
      for (const key of ["N", "A", "U", "R", "Q", "E", "L", "need_part", "nope"])
        same(
          `shareSentence(${id}, ${key})`,
          run(() => proto.shareSentence(id, key)),
          run(() => (port as Api).shareSentence(id, key))
        );
    }
    same(
      "ruleLabel(nope)",
      run(() => proto.ruleLabel("nope")),
      run(() => (port as Api).ruleLabel("nope"))
    );
    for (const key of Object.keys(proto.TERMS))
      same(`term(${key})`, prototypeValue("TERMS", proto.TERMS)[key], port.term(key as port.TermKey));
    same(
      "term(nope)",
      run(() => proto.term("nope")),
      run(() => (port as Api).term("nope"))
    );
    flush();
  });

  describe.each(DATASET_DIRS.map(([name]) => name))("%s data", (name) => {
    const dataset = () => datasets.find((d) => d.name === name) as Dataset;

    it("binds the same counts and fixed copy", async () => {
      const { data } = dataset();
      const P = proto.copyFor(data);
      const Q: Api = await withLater(port.copyFor(data as unknown as CopyData));
      same("counts", P.counts, Q.counts);
      for (const k of [
        "TERMS",
        "STRINGS",
        "IDEAS",
        "LAYOUT",
        "HELP",
        "KEYS",
        "GUIDE",
        "GLOSSARY_GROUPS",
        "HOW_IT_WORKS",
        "FIRST_QUESTIONS",
        "RULE_IDS",
      ])
        same(`${k}`, prototypeValue(k, P[k], P.counts), Q[k]);
      same("groupsSentence()", P.groupsSentence(), Q.groupsSentence());
      for (const r of proto.RULE_IDS as string[])
        same(`groupsSentence(${r})`, P.groupsSentence(r), Q.groupsSentence(r));
      for (const r of proto.RULE_IDS as string[]) same(`scope(${r})`, P.scope(r), Q.scope(r));
      same("urgencyDefinition()", P.urgencyDefinition(), Q.urgencyDefinition());
      same(
        "defaultListStatement()",
        run(() => P.defaultListStatement()),
        run(() => Q.defaultListStatement())
      );
      same(
        "defaultListStatementLong()",
        run(() => P.defaultListStatementLong()),
        run(() => Q.defaultListStatementLong())
      );
      same(
        "urgencyReassurance()",
        run(() => P.urgencyReassurance()),
        run(() => Q.urgencyReassurance())
      );
      // The prototype also returns its own COUNTS alias of counts, which the port does not. The port adds
      // `segments`, the sentences that name a school with each name marked; the prototype has no such form.
      same(
        "the keys of the bound object",
        Object.keys(P)
          .filter((k) => k !== "COUNTS")
          .sort(),
        Object.keys(Q)
          .filter((k) => !["segments", "later", "GUIDE_SEGMENTS", "howExample"].includes(k))
          .sort()
      );
      flush();
    });

    it("says the same about every rule pair", () => {
      const { data } = dataset();
      const P = proto.copyFor(data);
      const Q: Api = port.copyFor(data as unknown as CopyData);
      const withSchools = { ...data };
      for (const a of proto.RULE_IDS as string[]) {
        for (const id of ["urgencyNote"])
          sameOutcome(
            `${id}(${a})`,
            run(() => P[id](a)),
            run(() => Q[id](a))
          );
        sameOutcome(
          `listStartsSentence(${a})`,
          run(() => P.listStartsSentence(data.schools, a)),
          run(() => Q.listStartsSentence(data.schools, a))
        );
        sameOutcome(
          `plain listStartsSentence(${a}, 1)`,
          run(() => proto.listStartsSentence(data.schools, a, 1)),
          run(() => port.listStartsSentence(data.schools as never, a as never, 1))
        );
        sameOutcome(
          `plain listStartsSentence(${a}, 6)`,
          run(() => proto.listStartsSentence(data.schools, a, 6)),
          run(() => port.listStartsSentence(data.schools as never, a as never, 6))
        );
        for (const b of proto.RULE_IDS as string[]) {
          for (const top of [undefined, 10, 20]) {
            sameOutcome(
              `comparisonSentence(${a}, ${b}, top ${top})`,
              run(() => P.comparisonSentence(a, b, undefined, { top })),
              run(() => Q.comparisonSentence(a, b, undefined, { top }))
            );
            sameOutcome(
              `plain comparisonSentence(${a}, ${b}, top ${top})`,
              run(() => proto.comparisonSentence(a, b, withSchools, { top })),
              run(() => port.comparisonSentence(a as never, b as never, withSchools as never, { top }))
            );
            sameOutcome(
              `plain comparisonSentence without schools(${a}, ${b}, top ${top})`,
              run(() =>
                proto.comparisonSentence(
                  a,
                  b,
                  { pairwise: data.pairwise, top20Changes: data.top20Changes },
                  { top }
                )
              ),
              run(() =>
                port.comparisonSentence(
                  a as never,
                  b as never,
                  { pairwise: data.pairwise, top20Changes: data.top20Changes } as never,
                  { top }
                )
              )
            );
          }
        }
      }
      sameOutcome(
        "plain urgencyReassurance",
        run(() => proto.urgencyReassurance(withSchools)),
        run(() => port.urgencyReassurance(withSchools as never))
      );
      sameOutcome(
        "plain urgencyReassurance without schools",
        run(() => proto.urgencyReassurance({ pairwise: data.pairwise })),
        run(() => port.urgencyReassurance({ pairwise: data.pairwise } as never))
      );
      sameOutcome(
        "plain defaultListStatement",
        run(() => proto.defaultListStatement(data)),
        run(() => port.defaultListStatement(data as never))
      );
      sameOutcome(
        "plain defaultListStatementLong",
        run(() => proto.defaultListStatementLong(data)),
        run(() => port.defaultListStatementLong(data as never))
      );
      flush();
    });

    it("says the same about every school under every rule", { timeout: 900_000 }, () => {
      const { data } = dataset();
      const P = proto.copyFor(data);
      const Q: Api = port.copyFor(data as unknown as CopyData);
      const c = P.counts;
      const rules = proto.RULE_IDS as string[];
      const keys = ["need", ...proto.INPUT_KEYS] as string[];
      const pairs: [string, string][] = rules.flatMap((a) =>
        rules.filter((b) => b !== a).map((b) => [a, b] as [string, string])
      );
      for (const s of data.schools) {
        const tag = s.id;
        // Three ways to call: bound to the data, the module's functions given the counts, and the module's bare functions.
        type Mode = "bound" | "counts" | "bare";
        const one = (label: string, f: (api: Api, mode: Mode) => unknown) => {
          sameOutcome(
            `${tag} ${label}`,
            run(() => f(P, "bound")),
            run(() => f(Q, "bound"))
          );
          sameOutcome(
            `${tag} with counts ${label}`,
            run(() => f(proto, "counts")),
            run(() => f(port as Api, "counts"))
          );
          sameOutcome(
            `${tag} bare ${label}`,
            run(() => f(proto, "bare")),
            run(() => f(port as Api, "bare"))
          );
        };
        const counts = (_api: Api, mode: Mode) => (mode === "counts" ? { counts: c } : {});
        one("displayName", (api) => api.displayName(s));
        one("distinctName", (api) => api.distinctName(s, data.schools));
        one("locationLine", (api) => api.locationLine(s));
        one("missingLabels", (api) => api.missingLabels(s));
        one("missingGroupLabel", (api) => api.missingGroupLabel(s));
        one("provinceHeading", (api) => api.provinceHeading(s.province));
        for (const k of keys) {
          one(`missingValueKind(${k})`, (api) => api.missingValueKind(s, k));
          one(`missingValueNote(${k})`, (api) => api.missingValueNote(s, k));
        }
        for (const k of proto.INPUT_KEYS as string[])
          one(`inputSentence(${k})`, (api) => api.inputSentence(s, k));
        for (const r of rules) {
          const t = `${r}`;
          for (const opts of [
            {},
            { name: true },
            { name: true, shortlist: 20 },
            { shortlist: 3 },
            { name: true, shortlist: 1 },
          ]) {
            one(`${t} rankSentence ${JSON.stringify(opts)}`, (api, mode) =>
              api.rankSentence(s, r, { ...opts, ...counts(api, mode) })
            );
          }
          one(`${t} placeHeadline`, (api, mode) => api.placeHeadline(s, r, counts(api, mode)));
          one(`${t} missingSentences`, (api) => api.missingSentences(s, r));
          one(`${t} missingSentence`, (api) => api.missingSentence(s, r));
          // A list that shows places and ranges together, and one that shows only ranges and incomplete records.
          for (const [name, list] of [
            ["mixed", data.schools],
            ["ranges only", data.schools.filter((x: { cohort: string }) => x.cohort !== "complete")],
          ] as const) {
            one(`${t} rowPlace ${name}`, (api, mode) => api.rowPlace(s, r, list, counts(api, mode)));
            one(`${t} scopesMix ${name}`, (api) => api.scopesMix(list, r));
          }
          for (const opts of [{}, { method: true }, { shortlist: 20 }, { method: true, shortlist: 10 }]) {
            one(`${t} placeContext ${JSON.stringify(opts)}`, (api, mode) =>
              api.placeContext(s, r, { ...opts, ...counts(api, mode) })
            );
          }
          one(`${t} fullRankingSentence`, (api, mode) => api.fullRankingSentence(s, r, counts(api, mode)));
          one(`${t} tieNote card`, (api) => api.tieNote(s, r, data.schools, "card"));
          one(`${t} tieNote row`, (api) => api.tieNote(s, r, data.schools, "row"));
          // The design records carry the flag but no margin, so every other flagged school is made threshold-adjacent.
          const near = { ...s, threshold_adjacent_circulated: s.id.length % 2 === 0 };
          for (const opts of [{}, { standardError: 0.005656854249492379 }, { standardError: 0.00001 }])
            one(`${t} persistenceNote ${JSON.stringify(opts)}`, (api) => api.persistenceNote(near, r, opts));
          one(`${t} reasonSentence`, (api) => api.reasonSentence(s, r));
          one(`${t} topDrivers`, (api) => api.topDrivers(s, r));
          one(`${t} contributions`, (api) => api.contributions(s, r));
        }
        for (const [a, b] of pairs)
          one(`${a}>${b} rangeComparisonSentence`, (api, mode) =>
            api.rangeComparisonSentence(s, a, b, counts(api, mode))
          );
        // Counts for each rule, as the API gives them: equal, different, and not given for a rule.
        for (const [a, b] of pairs) {
          const sized = (complete: number, ranked: number) => ({
            complete,
            range: ranked - complete,
            ranked,
          });
          for (const [label, byRule] of [
            ["equal", { [a]: sized(5, 8), [b]: sized(5, 8) }],
            ["differ", { [a]: sized(5, 8), [b]: sized(6, 9) }],
            ["one unknown", { [a]: sized(5, 8) }],
            ["none", {}],
            ["shared", "shared"],
          ] as const)
            one(`${a}>${b} rangeComparisonSentence per rule ${label}`, (api) =>
              api.rangeComparisonSentence(s, a, b, { counts: sized(7, 10), countsByRule: byRule })
            );
          one(`${a} rankSentence per rule`, (api) =>
            api.rankSentence(s, a, { counts: sized(7, 10), countsByRule: { [a]: sized(5, 8) } })
          );
        }
        if (mismatches.length >= 40) break;
      }
      flush();
    });
  });
});
