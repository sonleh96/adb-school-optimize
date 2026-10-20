/**
 * Why a school sits where it does: how much each input adds under a rule, the two or three that add most, and a
 * plain sentence for each input read from the school's own record. A blank source cell reads as not recorded and
 * a zero denominator as unusable; nothing is filled in.
 */
import { REMOTENESS_SCALE } from "./definitions";
import {
  SMALL,
  capitalise,
  cleanedOrNull,
  formatApprox,
  formatCount,
  formatPercent,
  joinList,
  plural,
} from "./format";
import type {
  AreaField,
  CopyRuleId,
  CopySchool,
  FacilityField,
  InputKey,
  NeedField,
  NeedKey,
  NeedParts,
} from "./model";
import { isNeedFirst, resultFor } from "./rank";
import { rule } from "./rules";

export const NEED_FIELDS: Readonly<Record<NeedKey, NeedField>> = {
  classrooms: "permanent_classroom_deficit",
  housing: "teacher_housing_deficit",
  facilities: "facility_presence_deficit",
  services: "service_deficit",
  locality: "locality_disadvantage",
};
export const NEED_KEYS = Object.keys(NEED_FIELDS) as NeedKey[];
export const isNeedKey = (key: string): key is NeedKey => (NEED_KEYS as readonly string[]).includes(key);
export const ORDER: readonly InputKey[] = [
  ...NEED_KEYS,
  "area",
  "urgency",
  "reach",
  "air",
  "emissions",
  "land",
];

export const FACILITIES: readonly (readonly [FacilityField, string])[] = [
  ["libraries", "library"],
  ["workshops", "workshop"],
  ["practical_skills", "practical-skills room"],
  ["home_economics", "home-economics room"],
  ["computer_labs", "computer laboratory"],
  ["specialized_classrooms", "special classroom"],
];

const POWER: Record<string, string | undefined> = {
  generator: "a generator",
  solar: "solar panels",
  hydro: "hydro power",
  "png power": "the PNG Power grid",
};
// Phrase after "its water".
const WATER: Record<string, string | undefined> = {
  "tank water": "from a tank",
  river: "from a river",
  "brining water from home": "is brought from home",
  lake: "from a lake",
  creek: "from a creek",
  "town supply": "from the town supply",
  "piped water": "is piped",
  well: "from a well",
  stream: "from a stream",
};
export const norm = (v: unknown): string => String(v).trim().toLowerCase();

/** A figure the record must hold for a school that can be put in order. Its absence is a broken record, not a sentence. */
function required(value: number | null | undefined, what: string): number {
  if (value == null) throw new Error(`A school that can be put in order has no ${what}`);
  return value;
}

const AREA_PARTS: readonly (readonly [AreaField, number])[] = [
  ["progression10_deficit", 0.25],
  ["progression12_deficit", 0.15],
  ["secondary_participation_deficit", 0.25],
  ["activity_deficit", 0.15],
  ["conflict_exposure", 0.1],
  ["female_disadvantage", 0.1],
];

/** How much each input adds to the rule's screening score. A key is absent when the rule does not use it. */
export type Contribution = Partial<Record<InputKey, number | null>>;

// Contribution of each input to the rule's screening score, keyed by ORDER. Null when not computed.
export function contributions(school: CopySchool, ruleId: CopyRuleId): Contribution | null {
  rule(ruleId);
  const res = resultFor(school, ruleId);
  if (!res || school.cohort === "queue") return null;
  const c = school.components;
  const np = school.need_parts;
  const missingAir = school.missing_env && school.missing_env.aqi;

  const fromRecorded = (id: "additive_u" | "additive_no_u"): Contribution | null => {
    const rec = school.contributions && school.contributions[id];
    if (!rec) return null;
    const x = rec.components;
    const out: Contribution = {};
    for (const k of NEED_KEYS) out[k] = x[NEED_FIELDS[k]];
    out.area = x.area;
    if (id === "additive_u") out.urgency = x.urgency;
    out.reach = x.reach;
    out.air = missingAir || x.aqi_lower !== x.aqi_upper ? null : x.aqi_lower;
    out.emissions = x.emissions_lower !== x.emissions_upper ? null : x.emissions_lower;
    out.land = x.land_lower !== x.land_upper ? null : x.land_lower;
    return out;
  };

  if (ruleId === "additive_u" || ruleId === "additive_no_u") return fromRecorded(ruleId);

  const needParts = (): NeedParts => {
    if (!np) throw new Error("A school that can be put in order has no need parts");
    return np;
  };

  if (isNeedFirst(ruleId)) {
    const parts = needParts();
    const out: Contribution = {};
    for (const k of NEED_KEYS) out[k] = parts[NEED_FIELDS[k]];
    return out;
  }

  if (ruleId === "benchmark") {
    const parts = needParts();
    const out: Contribution = {};
    for (const k of NEED_KEYS) out[k] = (0.55 / 5) * required(parts[NEED_FIELDS[k]], NEED_FIELDS[k]);
    out.area = 0.2 * required(c.A, "district-context value");
    out.urgency = 0.15 * required(c.U, "urgency value");
    out.reach = 0.1 * required(c.R, "reach value");
    return out;
  }

  // Largest factor: 0.60 x weighted screening score + 0.40 x the largest of N, A (and U).
  const base = fromRecorded(ruleId === "bottleneck_u" ? "additive_u" : "additive_no_u");
  if (!base) throw new Error(`No recorded contributions to build ${ruleId} from`);
  const out: Contribution = {};
  for (const [k, v] of Object.entries(base) as [InputKey, number | null | undefined][]) {
    out[k] = v == null ? null : 0.6 * v;
  }
  const add = (key: InputKey, by: number) => {
    out[key] = (out[key] ?? 0) + by;
  };
  const top = largestFactor(school, ruleId);
  if (top === "N") {
    const parts = needParts();
    for (const k of NEED_KEYS) add(k, (0.4 / 5) * required(parts[NEED_FIELDS[k]], NEED_FIELDS[k]));
  } else if (top === "A") add("area", 0.4 * required(c.A, "district-context value"));
  else add("urgency", 0.4 * required(c.U, "urgency value"));
  return out;
}

type Largest = "N" | "A" | "U";
function largestFactor(school: CopySchool, ruleId: CopyRuleId): Largest {
  const N = required(school.components.N, "school need");
  const A = required(school.components.A, "district-context value");
  if (ruleId === "bottleneck_u") {
    const U = required(school.components.U, "urgency value");
    if (U > N && U > A) return "U";
  }
  return A > N ? "A" : "N";
}
const LARGEST_NAME: Record<Largest, string> = {
  N: "school need",
  A: "district context",
  U: "the urgency value",
};

export const INPUT_KEYS: readonly InputKey[] = Object.freeze([...ORDER]);

// One plain fact sentence for any input of any school, for breakdown rows and reasons.
// Blank source cells read as not recorded, zero denominators as unusable; nothing is filled in.
export function inputSentence(school: CopySchool, key: InputKey): string {
  const k = school.condition;
  switch (key) {
    case "classrooms": {
      const total = k.classrooms_total,
        perm = k.classrooms_permanent;
      if (total == null) return "The total number of classrooms is not recorded.";
      if (total === 0) return "The record gives 0 classrooms in total, which needs checking.";
      if (perm == null)
        return `The record gives ${total} ${plural(total, "classroom", "classrooms")}, but not how many are built of permanent materials.`;
      if (total === 1)
        return perm >= 1
          ? "Its one classroom is built of permanent materials."
          : "Its one classroom is not built of permanent materials.";
      if (perm === 0) return `None of its ${total} classrooms is built of permanent materials.`;
      if (perm >= total) return `All ${total} of its classrooms are built of permanent materials.`;
      return `${perm} of its ${total} classrooms ${plural(perm, "is", "are")} built of permanent materials.`;
    }
    case "housing": {
      const t = k.teachers,
        h = k.teacher_houses;
      if (t == null && h == null) return "The numbers of teachers and teacher houses are not recorded.";
      if (t == null) return "The number of teachers is not recorded.";
      if (t === 0) return "The record gives 0 teachers, which needs checking.";
      const teachers = t === 1 ? "its one teacher" : `its ${t} teachers`;
      if (h == null) return `The number of teacher houses for ${teachers} is not recorded.`;
      if (h === 0) return `It has no teacher houses for ${teachers}.`;
      return `It has ${h} teacher ${plural(h, "house", "houses")} for ${teachers}.`;
    }
    case "facilities": {
      const blank = FACILITIES.filter(([f]) => k[f] == null).length;
      if (blank === 6) return "Its facility counts are not recorded.";
      if (blank > 0)
        return `${capitalise(SMALL[blank])} of its six facility counts ${plural(blank, "is", "are")} not recorded.`;
      const have = FACILITIES.filter(([f]) => (k[f] ?? 0) > 0).map(([, n]) => n);
      const lack = FACILITIES.filter(([f]) => !((k[f] ?? 0) > 0)).map(([, n]) => n);
      if (have.length === 0)
        return "It has none of the six facility types the study counts, such as a library or a workshop.";
      if (lack.length === 0) return "It has all six facility types the study counts.";
      if (have.length === 1) return `Of the six facility types the study counts, it has only a ${have[0]}.`;
      return `It has no ${joinList(lack, "or")}.`;
    }
    case "services": {
      const pRaw = k.power_source,
        wRaw = k.water_source;
      const p = pRaw == null ? null : POWER[norm(pRaw)];
      const w = wRaw == null ? null : WATER[norm(wRaw)];
      if (pRaw != null && !p)
        return `Its power source is recorded as ${String(pRaw).trim()}, a type that is not on the study's scale.`;
      if (wRaw != null && !w)
        return `Its water source is recorded as ${String(wRaw).trim()}, a type that is not on the study's scale.`;
      if (!p && !w) return "Its power and water sources are not recorded.";
      if (!p) return `Its power source is not recorded. Its water ${w}.`;
      if (!w) return `Its power comes from ${p}. Its water source is not recorded.`;
      const join = w.startsWith("from") ? " and " : ", and ";
      return `Its power comes from ${p}${join}its water ${w}.`;
    }
    case "locality":
      return school.locality == null || String(school.locality).trim() === ""
        ? "Its remoteness category is not recorded."
        : `Its record classes it as ${norm(school.locality)}, on ${REMOTENESS_SCALE}.`;
    case "area":
      return describeDistrict(school);
    case "urgency":
      return `Its urgency value is ${required(school.components.U, "urgency value").toFixed(2)} on a 0 to 1 scale. No one could trace where that value comes from.`;
    case "reach": {
      const R = required(school.components.R, "reach value");
      const who =
        R >= 0.67
          ? "Many people"
          : R >= 0.33
            ? "A moderate number of people"
            : R > 0
              ? "Relatively few people"
              : "Very few people, compared with other schools,";
      return `${who} live within modelled walking distance of it.`;
    }
    case "air": {
      const q = school.raw.Q_raw;
      return q == null
        ? "Its air-quality reading is not recorded. The study assigns an air-pollution index to each school's location, and none was assigned to this one."
        : `Its air-quality index, a measure of air pollution assigned to its location, reaches ${formatCount(q)} on its worst 1 day in 20.`;
    }
    case "emissions": {
      const e = school.raw.E_raw;
      if (e == null) return "Its nearby emissions figure is not recorded, so it is not counted as 0.";
      return e > 0
        ? `Fixed emission sources within 10 km account for about ${formatApprox(e)} tonnes of CO2-equivalent a year in the Climate TRACE inventory.`
        : "The Climate TRACE inventory lists no fixed emission sources within 10 km.";
    }
    case "land": {
      const l = school.raw.L_raw;
      if (l == null) return "Its land-cover figure is not recorded, so it is not counted as 0.";
      return l > 0
        ? `Satellite maps class ${l < 0.0005 ? "less than 0.1%" : formatPercent(l)} of the area within 500 m as water or flooded vegetation.`
        : "Satellite maps class none of the area within 500 m as water or flooded vegetation.";
    }
    default:
      throw new Error(`No input called ${String(key)}`);
  }
}

function describeDistrict(school: CopySchool): string {
  const a = school.area_parts;
  const phrase = (field: AreaField, v: number): string | null => {
    switch (field) {
      case "progression10_deficit":
        return `${formatPercent(1 - v)} of students are recorded as moving on from Grade 7 to Grade 10`;
      case "progression12_deficit":
        return `${formatPercent(1 - v)} of students are recorded as moving on from Grade 7 to Grade 12`;
      case "secondary_participation_deficit":
        return v >= 0.5 ? "there are relatively few secondary students for the population" : null;
      case "activity_deficit":
        return v >= 0.5
          ? "there is little night-time light, which the study uses as a sign of economic activity"
          : null;
      case "conflict_exposure":
        return v >= 0.5 ? "a relatively large population is exposed to recorded conflict" : null;
      case "female_disadvantage":
        return `girls make up ${formatPercent(0.5 - 0.5 * v)} of enrolled students`;
      default:
        return null;
    }
  };
  const ranked = a
    ? AREA_PARTS.flatMap(([f, w]) => {
        const v = a[f];
        return v == null ? [] : [{ f, v, weighted: w * v }];
      })
        .filter((x) => x.weighted > 0 && phrase(x.f, x.v))
        .sort((x, y) => y.weighted - x.weighted)
    : [];
  const district = cleanedOrNull(school.district);
  const where = district
    ? `In its district, ${district},`
    : "In its district, which the record does not name,";
  if (ranked.length === 0) {
    return `${where} the district-context value is ${required(school.components.A, "district-context value").toFixed(2)}.`;
  }
  const picked = ranked.slice(0, 1);
  if (ranked[1] && ranked[1].weighted >= 0.5 * ranked[0].weighted) picked.push(ranked[1]);
  const p10 = picked.find((x) => x.f === "progression10_deficit");
  const p12 = picked.find((x) => x.f === "progression12_deficit");
  if (p10 && p12) {
    return `${where} ${formatPercent(1 - p10.v)} of students are recorded as moving on from Grade 7 to Grade 10, and ${formatPercent(1 - p12.v)} from Grade 7 to Grade 12.`;
  }
  return `${where} ${joinList(picked.map((x) => phrase(x.f, x.v) as string))}.`;
}

export interface Driver {
  readonly key: InputKey;
  readonly value: number;
  readonly sentence: string;
}

// The two or three inputs that add most under this rule, largest first.
export function topDrivers(school: CopySchool, ruleId: CopyRuleId): Driver[] {
  const contrib = contributions(school, ruleId);
  if (!contrib) return [];
  const usesU = rule(ruleId).usesUrgency;
  const items = ORDER.flatMap((k) => {
    const v = contrib[k];
    return k in contrib && v != null && v > 1e-12 && (k !== "urgency" || usesU) ? [{ key: k, value: v }] : [];
  }).sort((x, y) => y.value - x.value || ORDER.indexOf(x.key) - ORDER.indexOf(y.key));
  const picked = items.slice(0, 2);
  if (items[2] && items[2].value >= 0.5 * items[1].value) picked.push(items[2]);
  // An input that ties exactly with the last one picked is named too, so the choice is never arbitrary.
  while (
    items[picked.length] &&
    Math.abs(items[picked.length].value - picked[picked.length - 1].value) < 1e-12
  ) {
    picked.push(items[picked.length]);
  }
  return picked.map((x) => ({ ...x, sentence: inputSentence(school, x.key) }));
}

export function reasonSentence(school: CopySchool, ruleId: CopyRuleId): string {
  const r = rule(ruleId);
  if (school.cohort === "queue") {
    return "This school has no place in the list yet, so there is no screening score to explain. Its entry shows what is missing.";
  }
  if (!resultFor(school, ruleId)) return `Not computed for this school under ${r.name}.`;
  const drivers = topDrivers(school, ruleId);
  if (drivers.length === 0) return `Under ${r.name}, none of its inputs adds to its screening score.`;
  const n = drivers.length;
  if (isNeedFirst(ruleId)) {
    return [
      `Under ${r.name}, school need sets the order, and other inputs only break exact ties.`,
      "School need is built from five parts of the school's own record.",
      `${capitalise(SMALL[n])} ${plural(n, "part raises", "parts raise")} its school need most.`,
      ...drivers.map((d) => d.sentence),
    ].join(" ");
  }
  const need = drivers.filter((d) => isNeedKey(d.key));
  const other = drivers.filter((d) => !isNeedKey(d.key));
  const parts = [
    `${capitalise(SMALL[n])} ${plural(n, "thing adds", "things add")} most to its screening score under ${r.name}.`,
  ];
  if (need.length) {
    let intro: string;
    if (other.length === 0)
      intro =
        need.length === 2
          ? "Both are parts of its school need, the measure built from five parts of its own record."
          : `All ${SMALL[need.length]} are parts of its school need, the measure built from five parts of its own record.`;
    else
      intro = `${capitalise(SMALL[need.length])} ${plural(need.length, "is a part", "are parts")} of its school need, the measure built from five parts of its own record.`;
    parts.push(intro, ...need.map((d) => d.sentence));
  }
  if (other.length) {
    if (need.length)
      parts.push(
        other.length === 1
          ? "The other is not part of its school need."
          : `The other ${SMALL[other.length]} are not part of its school need.`
      );
    parts.push(...other.map((d) => d.sentence));
  }
  if (ruleId === "bottleneck_u" || ruleId === "bottleneck_no_u") {
    const which =
      ruleId === "bottleneck_u"
        ? "the largest of school need, district context and the urgency value"
        : "the larger of school need and district context";
    parts.push(
      `This rule gives an extra share to ${which}. For this school that is ${LARGEST_NAME[largestFactor(school, ruleId)]}.`
    );
  }
  return parts.join(" ");
}
