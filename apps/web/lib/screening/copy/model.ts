/**
 * The data the plain-language copy reads. The copy functions are a port of the design prototype's `copy.js`, and
 * this is the shape of the records that prototype reads, so a sentence is the same for the same record.
 *
 * Nothing here is an API shape. `adapter.ts` builds these from the screening API's responses.
 * A missing source cell is `null` everywhere, never 0 and never an empty string.
 */

/** The seven rules the copy has words for. */
export type CopyRuleId =
  | "additive_u"
  | "additive_no_u"
  | "need_first_u"
  | "need_first_no_u"
  | "bottleneck_u"
  | "bottleneck_no_u"
  | "benchmark";

/** The group a school falls in under the rule being shown. The API calls the last one `verification_queue`. */
export type CopyCohort = "complete" | "interval" | "queue";

/** The five parts of school need, under the names the sentences use. */
export type NeedKey = "classrooms" | "housing" | "facilities" | "services" | "locality";
/** Every input a reason can name, in reading order. */
export type InputKey = NeedKey | "area" | "urgency" | "reach" | "air" | "emissions" | "land";

export type NeedField =
  | "permanent_classroom_deficit"
  | "teacher_housing_deficit"
  | "facility_presence_deficit"
  | "service_deficit"
  | "locality_disadvantage";
/** The other reasons the engine holds a school back for, named by the reason. */
export type OtherGate =
  "negative_stock_value" | "unresolved_area_context" | "unresolved_reach" | "urgency_unknown";
/** Why a school is held back: a need part that cannot be used, or one of the other reasons. */
export type GateKey = NeedField | OtherGate;
export type AreaField =
  | "progression10_deficit"
  | "progression12_deficit"
  | "secondary_participation_deficit"
  | "activity_deficit"
  | "conflict_exposure"
  | "female_disadvantage";
export type FacilityField =
  | "libraries"
  | "workshops"
  | "practical_skills"
  | "home_economics"
  | "computer_labs"
  | "specialized_classrooms";

export type NeedParts = Readonly<Record<NeedField, number | null>>;
export type AreaParts = Readonly<Record<AreaField, number | null>>;

/** The school's recorded counts and sources, as the record gave them. */
export type CopyCondition = Readonly<
  Record<
    FacilityField | "teachers" | "classrooms_total" | "classrooms_permanent" | "teacher_houses",
    number | null
  > & {
    power_source: string | null;
    water_source: string | null;
  }
>;

/** A stored input the record holds but the copy cannot read: a text where a number belongs, or the reverse. */
export type UnreadableInput = keyof CopyCondition | "aqi" | "emissions" | "land" | "urgency";

export interface CopyComponents {
  readonly N: number | null;
  readonly A: number | null;
  /** `null` is an urgency value that is unknown. Absent means no rule that reads urgency has a run, so it was not read. */
  readonly U?: number | null;
  readonly R: number | null;
  readonly Q: number | null;
  readonly E: number | null;
  readonly L: number | null;
}

/** The raw air-quality, emissions and land-cover readings. `null` means the source left it blank. */
export interface CopyRaw {
  readonly Q_raw: number | null;
  readonly E_raw: number | null;
  readonly L_raw: number | null;
}

export interface MissingEnv {
  readonly aqi: boolean;
  readonly emissions: boolean;
  readonly land: boolean;
}

/** One school under one rule. A key is absent when the rule does not define it for the school. */
export interface CopyResult {
  /** The place among the schools with every input recorded. */
  readonly rank_complete120?: number | null;
  readonly rank_best?: number | null;
  readonly rank_worst?: number | null;
  /** `eligible124` when the bounds count all the schools that can be put in order. */
  readonly rank_bounds_scope?: string | null;
  readonly score_point?: number | null;
  /** The engine's own lowest and highest score for the school, under every rule; a school with a range has both. */
  readonly score_lower?: number | null;
  readonly score_upper?: number | null;
  /** Only under the two need-first rules. */
  readonly school_need?: number | null;
  readonly secondary_score_lower?: number | null;
}

export type ResultsByRule = Partial<Record<CopyRuleId, CopyResult | null>>;

/** The factors a largest-factor rule picks its extra share from: school need, district context, urgency. */
export type Largest = "N" | "A" | "U";

/** The rules whose own recorded contributions the copy reads: the combined-factors and the largest-factor rules. */
export type RecordedRule = "additive_u" | "additive_no_u" | "bottleneck_u" | "bottleneck_no_u";

/**
 * What a rule recorded for each input, at the grain `contributions()` reads, as the API sent it for that rule:
 * a largest-factor rule's figures already hold its 60% share of the weighted sum.
 */
export interface RecordedContribution {
  readonly components: Readonly<
    Record<NeedField, number> & {
      area: number;
      urgency?: number;
      reach: number;
      aqi_lower: number;
      aqi_upper: number;
      emissions_lower: number;
      emissions_upper: number;
      land_lower: number;
      land_upper: number;
    }
  >;
  /**
   * The extra share a largest-factor rule gives to its largest factor, with the factor or factors that attain it
   * (more than one when they tie). Absent under the rules that have no such share.
   */
  readonly largest?: {
    readonly factors: readonly Largest[];
    readonly value: number;
    readonly share: number;
    readonly contribution: number;
  };
}

/** What the place sentences, ties and names read. A school in the list has at least this. */
export interface NamedSchool {
  readonly id: string;
  readonly name: string | null;
  readonly province: string | null;
  readonly district: string | null;
}

export interface PlacedSchool extends NamedSchool {
  readonly cohort: CopyCohort;
  readonly results: ResultsByRule | null;
  readonly missing_env?: MissingEnv;
  readonly raw?: Partial<CopyRaw>;
}

/** A school with its whole record, which the reasons, the missing-detail notes and the counts need. */
export interface CopySchool extends PlacedSchool {
  readonly locality: string | null;
  readonly missing_env: MissingEnv;
  readonly condition: CopyCondition;
  readonly need_parts: NeedParts | null;
  readonly area_parts: AreaParts | null;
  readonly components: CopyComponents;
  readonly raw: CopyRaw;
  /**
   * Why the school is held back under the rule shown: the need parts that are blank or unusable, then the other
   * reasons in the engine's order. Empty for a school that can be put in order.
   */
  readonly gate_failures: readonly GateKey[];
  readonly contributions?: Partial<Record<RecordedRule, RecordedContribution>>;
  /** The stored inputs that could not be read, in reading order. Absent when every input was read. */
  readonly unreadable?: readonly UnreadableInput[];
  readonly persistent_candidate_circulated?: boolean;
  /** A flagged school whose lowest frequency is only just above the line (circulated rule only). */
  readonly threshold_adjacent_circulated?: boolean;
}

/** What `countsFrom` reads. Every field is optional because a caller may only know some of the school. */
export interface CountableSchool {
  readonly cohort: CopyCohort;
  readonly locality?: string | null;
  readonly components?: Partial<CopyComponents>;
  readonly raw?: Partial<CopyRaw>;
  readonly gate_failures?: readonly string[];
  readonly missing_env?: Partial<MissingEnv>;
  readonly condition?: Readonly<Record<string, unknown>>;
  readonly persistent_candidate_circulated?: boolean;
}

/**
 * Counts taken from the data. A key that is absent is unknown, and the sentence that would state it is written
 * without the number. `countsFrom` fills every key.
 */
export type CountBag = Readonly<Partial<Record<string, number>>>;

/**
 * The group sizes of each rule's own run. The groups differ between rules (a rule that leaves urgency out can put
 * more schools in order), so a sentence about a rule counts that rule's group.
 */
export type CountsByRule = Readonly<Partial<Record<CopyRuleId, CountBag>>>;

/**
 * Given as an object, `CountsByRule` is the whole truth: a rule it does not hold has unknown counts, never another
 * rule's. `"shared"` says that every rule counts the groups in `counts`, which is right only for data of one run
 * (the design prototype's). `bindCopy` builds the object from the lists.
 */
export type CountsByRuleArg = CountsByRule | "shared";

export type Counts = {
  readonly all: number;
  readonly complete: number;
  readonly range: number;
  readonly queue: number;
  readonly urgencyZero: number;
  readonly emissionsNone: number;
  readonly airMissing: number;
  readonly remotenessOnly: number;
  readonly flagged: number;
  readonly ranked: number;
};

/** The study's recorded comparison of two rules, one row. */
export interface PairwiseRow {
  readonly left_rule: string;
  readonly right_rule: string;
  /** The number of schools both rules ordered. */
  readonly n?: number | null;
  readonly top10_overlap: number;
  readonly top20_overlap: number;
  readonly top30_overlap: number;
  readonly top40_overlap: number;
  readonly median_absolute_rank_shift: number;
  readonly maximum_absolute_rank_shift: number;
}

/** A school that joins or leaves the top 20 when the rule changes from `left_rule` to `right_rule`. */
export interface Top20Change {
  readonly left_rule: string;
  readonly right_rule: string;
  readonly status: string;
  readonly left_rank: number;
  readonly right_rank: number;
  readonly "School Name": string;
  /** The school's id, when the source gives one, so the name can be told apart from a twin's. */
  readonly school_key?: string;
}

/** What `comparisonSentence` and its relatives read. `schools` is needed only for the top-10 names. */
export interface ComparisonData {
  readonly pairwise: readonly PairwiseRow[];
  readonly top20Changes?: readonly Top20Change[];
  readonly schools?: readonly PlacedSchool[];
}

export interface Term {
  readonly technical: string;
  readonly label: string;
  readonly line: string;
  readonly help: string;
  readonly where: string;
}
