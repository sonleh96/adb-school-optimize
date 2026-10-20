/**
 * Sentences as segments: the plain text of a sentence, with each embedded name marked.
 *
 * A name in a generated sentence has to read as a name even when it looks like punctuation or a rule letter (a
 * school called "J"), so the screen needs to know where each name sits. A sentence that embeds names is built here
 * as `Segments`: an array whose items are text, or a `NameSegment` that holds one name. The plain string is
 * always `textOf(segments)`, so the string and the marked form cannot say different things. Every function that
 * puts a name in a sentence has a `...Segments` form and a string form that is `textOf` of it.
 *
 * Marked names are the names of schools (the display form, with a district or record id added when two schools
 * would otherwise read the same) and the names a person gives a saved view. A rule's name is not a school name and
 * is plain text.
 *
 * Build segments with `seg`, a template tag: strings and numbers become text, a `NameSegment` stays a name, and an
 * array of segments is spliced in. Adjacent text is merged, so two builds of the same sentence compare equal.
 */

export type NameKind = "school" | "saved-view";

/** One name inside a sentence. `name` is exactly the characters in the plain text. */
export interface NameSegment {
  readonly name: string;
  readonly kind: NameKind;
}

/** Text, or a marked name. */
export type Segment = string | NameSegment;
export type Segments = readonly Segment[];

export const nameSegment = (name: string, kind: NameKind = "school"): NameSegment => ({ name, kind });

export const isName = (s: Segment): s is NameSegment => typeof s !== "string";

/** The plain sentence. */
export const textOf = (segments: Segments): string => segments.map((s) => (isName(s) ? s.name : s)).join("");

/** The marked names, in the order they appear. */
export const namesIn = (segments: Segments, kind?: NameKind): string[] =>
  segments.filter(isName).flatMap((s) => (kind === undefined || s.kind === kind ? [s.name] : []));

export interface NameSpan {
  readonly name: string;
  readonly kind: NameKind;
  /** Offsets into `textOf(segments)`; `end` is exclusive. */
  readonly start: number;
  readonly end: number;
}

/** Where each marked name sits in the plain text. */
export function spansOf(segments: Segments): NameSpan[] {
  const out: NameSpan[] = [];
  let at = 0;
  for (const s of segments) {
    if (isName(s)) {
      out.push({ name: s.name, kind: s.kind, start: at, end: at + s.name.length });
      at += s.name.length;
    } else at += s.length;
  }
  return out;
}

type Part = Segment | Segments | number;

/** Merges adjacent text and drops empty text, so equal sentences have equal segments. */
function normalise(parts: readonly Segment[]): Segments {
  const out: Segment[] = [];
  for (const p of parts) {
    if (isName(p)) out.push(p);
    else if (p !== "") {
      const last = out[out.length - 1];
      if (typeof last === "string") out[out.length - 1] = last + p;
      else out.push(p);
    }
  }
  return out;
}

function flatten(part: Part, into: Segment[]): void {
  if (typeof part === "number") into.push(String(part));
  else if (Array.isArray(part)) for (const p of part as Segments) into.push(p);
  else into.push(part as Segment);
}

/** Template tag: `seg\`${name} is ${place}.\``. */
export function seg(strings: TemplateStringsArray, ...values: Part[]): Segments {
  const parts: Segment[] = [];
  strings.forEach((text, i) => {
    parts.push(text);
    if (i < values.length) flatten(values[i], parts);
  });
  return normalise(parts);
}

/** Splices segments, with `separator` between them. */
export function joinSegments(parts: readonly Segments[], separator = " "): Segments {
  const out: Segment[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(separator);
    out.push(...p);
  });
  return normalise(out);
}

/** `joinList` for segments: "A", "A and B", "A, B and C". */
export function listSegments(items: readonly Segments[], conjunction = "and"): Segments {
  if (items.length === 0) throw new Error("joinList needs at least one item");
  if (items.length === 1) return items[0];
  if (items.length === 2) return joinSegments(items, ` ${conjunction} `);
  return joinSegments([joinSegments(items.slice(0, -1), ", "), items[items.length - 1]], ` ${conjunction} `);
}

/** A list of names, each marked. */
export const nameList = (
  names: readonly string[],
  kind: NameKind = "school",
  conjunction = "and"
): Segments =>
  listSegments(
    names.map((n) => [nameSegment(n, kind)]),
    conjunction
  );
