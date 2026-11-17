/**
 * How many school records the list covers, for the homepage. The page reads them from the screening API when it is
 * built and again at most once an hour after that (app/page.tsx), so it stays a static page between reads. When the
 * API does not answer, or answers with something else, the page says the same things without numbers: a homepage
 * never waits on the API and never shows a broken number.
 *
 * The numbers are the main rule's groups, from its list's manifest, which counts the whole run whatever the filter:
 * every record, the schools that can be put in order (with one rank or a range of ranks), and the records to verify.
 */
import { PRIMARY_RULE } from "@/lib/screening/rule-pair";
import { failParse, int, obj, parseWith, refine } from "@/lib/screening/schema";

export type HomeCounts =
  | {
      readonly kind: "known";
      readonly records: number;
      readonly inOrder: number;
      readonly toVerify: number;
    }
  | { readonly kind: "unknown" };

export const UNKNOWN_COUNTS: HomeCounts = Object.freeze({ kind: "unknown" });

/** How long a read may take before the page goes without numbers. A cold API takes a few seconds to start. */
export const READ_TIMEOUT_MS = 8000;

/**
 * The page states the groups side by side, so they must add up to the records. A run with no records is the API
 * before its data is loaded; "0 records" would tell a reader nothing true about the project, so it gives no numbers.
 */
const groups = refine(
  obj({ records: int, complete: int, interval: int, verification_queue: int }),
  (g, path) =>
    g.records > 0 &&
    [g.complete, g.interval, g.verification_queue].every((n) => n >= 0) &&
    g.records === g.complete + g.interval + g.verification_queue
      ? g
      : failParse(path, "at least one record, in groups that add up to the records", g)
);
const listManifest = obj({ manifest: obj({ cohort_counts: groups }) });

/** The counts in a list response. Throws a `ParseError` when the body does not hold them. */
export function countsFromBody(body: unknown): HomeCounts {
  const g = parseWith(listManifest, body, "Homepage counts").manifest.cohort_counts;
  return {
    kind: "known",
    records: g.records,
    inOrder: g.complete + g.interval,
    toVerify: g.verification_queue,
  };
}

/**
 * The counts from the API at `origin`, the server the app's `/api/v1` routes go to (`next.config.mjs` passes it as
 * `SCREENING_API_ORIGIN`). No origin, a failed read, one slower than `timeoutMs`, or a body without the counts all
 * give `UNKNOWN_COUNTS`.
 */
export async function readHomeCounts(origin: string, timeoutMs = READ_TIMEOUT_MS): Promise<HomeCounts> {
  if (!origin) return UNKNOWN_COUNTS;
  const url = `${origin}/api/v1/screening/results?rule=${encodeURIComponent(PRIMARY_RULE)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`the API answered ${response.status}`);
    return countsFromBody(await response.json());
  } catch (error) {
    // A build log line, so a homepage without numbers can be traced to its read.
    console.warn(`Homepage counts: no numbers, because ${error instanceof Error ? error.message : error}.`);
    return UNKNOWN_COUNTS;
  }
}
