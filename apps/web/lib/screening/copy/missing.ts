/** What is missing from a record, and whether each missing value is blank or recorded but unusable. */
import { isRemotenessOnly } from "./counts";
import { gateSentence, otherCause } from "./causes";
import { REMOTENESS_CATEGORIES } from "./definitions";
import { SMALL, capitalise, isBlank, joinList } from "./format";
import { OTHER_GATES, isNeedGate, isOtherGate } from "./gates";
import { FACILITIES } from "./inputs";
import type { CopySchool, GateKey, InputKey, NeedField, NeedKey, OtherGate } from "./model";
import { missingReadingsClause } from "./rank";
import { NEED_FIELDS, ORDER, isNeedKey, norm } from "./reasons";
import { TERMS } from "./terms";
import { LAYOUT } from "./words";

const PART_OF_GATE: Record<NeedField, NeedKey> = {
  permanent_classroom_deficit: "classrooms",
  teacher_housing_deficit: "housing",
  facility_presence_deficit: "facilities",
  service_deficit: "services",
  locality_disadvantage: "locality",
};

interface PartCause {
  readonly kind: "blank" | "unusable";
  readonly text: string;
  readonly label: string;
  readonly effect?: string;
}

const isBlankLocality = isBlank;

// Why one need part cannot be used, read from the raw fields.
// kind is 'blank' (the source cell is empty) or 'unusable' (recorded, but the calculation cannot use it).
function partCause(school: CopySchool, key: NeedKey): PartCause {
  const k = school.condition;
  switch (key) {
    case "classrooms":
      if (k.classrooms_total == null)
        return {
          kind: "blank",
          text: "the total number of classrooms is blank in the record",
          label: "Classroom count blank",
        };
      if (k.classrooms_total === 0)
        return {
          kind: "unusable",
          text: "the record gives 0 classrooms in total",
          label: "Record gives 0 classrooms, needs checking",
          effect:
            "which needs checking, and until then the share built of permanent materials cannot be worked out",
        };
      return {
        kind: "blank",
        text: "the number of classrooms built of permanent materials is blank in the record",
        label: "Permanent classroom count blank",
      };
    case "housing":
      if (k.teachers == null && k.teacher_houses == null)
        return {
          kind: "blank",
          text: "the numbers of teachers and teacher houses are blank in the record",
          label: "Teacher and house counts blank",
        };
      if (k.teachers == null)
        return {
          kind: "blank",
          text: "the number of teachers is blank in the record",
          label: "Teacher count blank",
        };
      if (k.teachers === 0)
        return {
          kind: "unusable",
          text: "the record gives 0 teachers",
          label: "Record gives 0 teachers, needs checking",
          effect: "which needs checking, and until then teacher housing cannot be worked out",
        };
      return {
        kind: "blank",
        text: "the number of teacher houses is blank in the record",
        label: "Teacher-house count blank",
      };
    case "facilities": {
      const blank = FACILITIES.filter(([f]) => k[f] == null).length;
      return {
        kind: "blank",
        text:
          blank === 6
            ? "all six facility counts are blank in the record"
            : `${SMALL[blank]} of the six facility counts are blank in the record`,
        label: "Facility counts blank",
      };
    }
    case "services": {
      const pBlank = k.power_source == null,
        wBlank = k.water_source == null;
      if (pBlank && wBlank)
        return {
          kind: "blank",
          text: "the power and water sources are both blank in the record",
          label: "Power and water source blank",
        };
      if (pBlank)
        return {
          kind: "blank",
          text: "the power source is blank in the record",
          label: "Power source blank",
        };
      if (wBlank)
        return {
          kind: "blank",
          text: "the water source is blank in the record",
          label: "Water source blank",
        };
      return {
        kind: "unusable",
        text: "the recorded power or water type is not on the study's scale",
        label: "Power or water type off the scale, needs checking",
        effect: "which needs checking, and until then power and water cannot be worked out",
      };
    }
    case "locality":
      if (!isBlankLocality(school.locality) && !REMOTENESS_CATEGORIES.includes(norm(school.locality)))
        return {
          kind: "unusable",
          text: "the recorded remoteness category is not on the study's scale",
          label: "Remoteness off the scale, needs checking",
          effect: "which needs checking, and until then remoteness cannot be worked out",
        };
      return {
        kind: "blank",
        text: "the remoteness category is blank in the record",
        label: "Remoteness blank",
      };
    default:
      throw new Error(`No need part called ${String(key)}`);
  }
}

const GATE_OF_KEY: Partial<Record<InputKey, OtherGate>> = {
  area: "unresolved_area_context",
  reach: "unresolved_reach",
  urgency: "urgency_unknown",
};

// The reasons a queue school is held back for: need parts first, then the other reasons in the engine's order.
function checkedGates(school: CopySchool): readonly GateKey[] {
  for (const g of school.gate_failures)
    if (!isNeedGate(g) && !isOtherGate(g)) throw new Error(`No gate called ${String(g)}`);
  return school.gate_failures;
}
const gateParts = (school: CopySchool): NeedKey[] =>
  checkedGates(school)
    .filter(isNeedGate)
    .map((g) => PART_OF_GATE[g]);
const otherGates = (school: CopySchool): OtherGate[] => {
  checkedGates(school);
  return OTHER_GATES.filter((g) => school.gate_failures.includes(g));
};

export type MissingValueKind = "recorded" | "blank" | "unusable" | "not_calculable" | "unresolved";

// 'recorded' | 'blank' | 'unusable' | 'not_calculable' | 'unresolved', for key 'need' or any INPUT_KEYS entry.
export function missingValueKind(school: CopySchool, key: "need" | InputKey): MissingValueKind {
  if (key === "need") return school.components.N == null ? "not_calculable" : "recorded";
  if (isNeedKey(key)) {
    const v = school.need_parts ? school.need_parts[NEED_FIELDS[key]] : null;
    return v == null ? partCause(school, key).kind : "recorded";
  }
  if (!ORDER.includes(key)) throw new Error(`No input called ${String(key)}`);
  const gate = GATE_OF_KEY[key];
  if (gate && (school.gate_failures.includes(gate) || (key === "urgency" && school.components.U === null)))
    return otherCause(school, gate).kind;
  const m = school.missing_env;
  if (key === "air" && (school.raw.Q_raw == null || m?.aqi)) return "unresolved";
  if (key === "emissions" && (school.raw.E_raw == null || m?.emissions)) return "unresolved";
  if (key === "land" && (school.raw.L_raw == null || m?.land)) return "unresolved";
  return "recorded";
}

const UNRESOLVED_WHAT: Partial<Record<InputKey, string>> = {
  air: "an air-quality reading",
  emissions: "a nearby emissions figure",
  land: "a land-cover figure",
};

// A sentence for a value's state, for the note beside a missing figure.
export function missingValueNote(school: CopySchool, key: "need" | InputKey): string {
  const kind = missingValueKind(school, key);
  if (kind === "recorded") return "Recorded in the source.";
  if (kind === "unresolved") {
    const what = (UNRESOLVED_WHAT[key as InputKey] as string).replace(/^an? /, "");
    const raw = { air: school.raw.Q_raw, emissions: school.raw.E_raw, land: school.raw.L_raw }[
      key as "air" | "emissions" | "land"
    ];
    const lead =
      raw == null
        ? `No ${what} is recorded for this school`
        : `The ${what} recorded for this school cannot be used`;
    return `${lead}, so it is not counted as 0.${school.cohort === "interval" ? " The school shows a range of places instead of one place." : ""}`;
  }
  const other = GATE_OF_KEY[key as InputKey];
  if (kind === "not_calculable") {
    if (key !== "need")
      return `${gateSentence(otherCause(school, other as OtherGate))} The tool does not fill it in or count it as 0.`;
    if (isRemotenessOnly(school))
      return "School need cannot be worked out, because only the remoteness category is recorded.";
    const reasons = gateParts(school).map((p) => partCause(school, p).text);
    return `School need cannot be worked out, because ${joinList(reasons)}.`;
  }
  if (other)
    return `${gateSentence(otherCause(school, other))} The tool does not fill it in or count it as 0.`;
  const c = partCause(school, key as NeedKey);
  if (kind === "blank") return `${capitalise(c.text)}. The tool does not fill it in or count it as 0.`;
  return `${capitalise(c.text)}. The calculation cannot use this value, so the record needs checking before this part can be worked out.`;
}

// Short chip labels for a school with an incomplete record, naming the actual cause.
export function missingLabels(school: CopySchool): string[] {
  if (school.cohort !== "queue") return [];
  const others = otherGates(school).map((g) => otherCause(school, g).label);
  if (isRemotenessOnly(school)) return [TERMS.missing_all_but_remoteness.label, ...others];
  const labels = [...gateParts(school).map((p) => partCause(school, p).label), ...others];
  return labels.length ? labels : ["Record needs checking"];
}

// The heading of a school in the list of incomplete records grouped by what is missing: the one cause when there is
// one, and a count when several details are missing. A school can sit under only one heading.
export function missingGroupLabel(school: CopySchool): string {
  if (school.cohort !== "queue") throw new Error("missingGroupLabel: only an incomplete record has a group");
  const labels = missingLabels(school);
  return labels.length === 1 ? labels[0] : LAYOUT.groupMany(labels.length);
}

// The same content as missingSentence, one standalone sentence per item, for record lists.
export function missingSentences(school: CopySchool): string[] {
  if (school.cohort === "complete") return ["All of its inputs are recorded."];
  if (school.cohort === "interval")
    return [`${missingReadingsClause(school)}.`, "Every other input is recorded."];
  const parts: string[] = [];
  const needs = gateParts(school),
    others = otherGates(school);
  if (isRemotenessOnly(school)) {
    parts.push(
      `Only its remoteness category is recorded, as ${norm(school.locality)}.`,
      "Its classroom, teacher, housing, facility, power and water details are all blank."
    );
  } else {
    for (const p of needs) {
      const c = partCause(school, p);
      parts.push(`${capitalise(c.text)}${c.effect ? `, ${c.effect}` : ""}.`);
    }
    if (isBlankLocality(school.locality) && !needs.includes("locality"))
      parts.push("The remoteness category is blank in the record.");
  }
  for (const g of others) parts.push(gateSentence(otherCause(school, g)));
  if (needs.length)
    parts.push(
      "Until these are checked, its school need cannot be worked out, so it has no place in the list yet."
    );
  else if (others.length === 0) parts.push("Its record needs checking before it can be put in order.");
  else if (others.length === 1 && others[0] === "urgency_unknown")
    parts.push(
      "The rules that leave urgency out do not need it, so they can put this school in order.",
      "Until the urgency value is recorded, it has no place in the list under a rule that uses urgency."
    );
  else
    parts.push(
      others.length === 1
        ? "Until this is checked, it has no place in the list yet."
        : "Until these are checked, it has no place in the list yet."
    );
  parts.push("Having no place in the list yet does not mean its need is low.");
  return parts;
}

export function missingSentence(school: CopySchool): string {
  return missingSentences(school).join(" ");
}
