/**
 * "Why it sits here" laid out: the copy's reason sentence split around the sentences of the inputs that add most, so
 * each reason gets a number and a box, and the reasons that are parts of school need sit inside one school need box
 * with its other parts listed after them. The words are the copy's; this only finds where each reason sits in them.
 * A reason's number is its size among the reasons, 1 for the largest, wherever the copy's grouping puts it.
 */
export interface DriverLike<K extends string = string> {
  readonly key: K;
  readonly sentence: string;
}

export type WhyBlock<K extends string> =
  | { readonly kind: "text"; readonly text: string }
  /** The school need box: the numbered parts first, by number, then the other parts, unnumbered. */
  | {
      readonly kind: "need";
      readonly parts: readonly { key: K; n: number | null; sentence: string | null }[];
    }
  | { readonly kind: "reason"; readonly key: K; readonly n: number; readonly sentence: string };

export interface Why<K extends string> {
  /** The opening sentence, set large; empty when the reasons start at once. */
  readonly lead: string;
  readonly blocks: readonly WhyBlock<K>[];
}

type Piece<K extends string> = { kind: "text"; text: string } | { kind: "driver"; driver: DriverLike<K> };

function pieces<K extends string>(text: string, drivers: readonly DriverLike<K>[]): Piece<K>[] | null {
  const hits = drivers.map((driver) => ({ driver, at: text.indexOf(driver.sentence) }));
  if (hits.length === 0 || hits.some((hit) => hit.at < 0)) return null;
  hits.sort((a, b) => a.at - b.at);
  const out: Piece<K>[] = [];
  let pos = 0;
  for (const hit of hits) {
    const before = text.slice(pos, hit.at).trim();
    if (before) out.push({ kind: "text", text: before });
    out.push({ kind: "driver", driver: hit.driver });
    pos = hit.at + hit.driver.sentence.length;
  }
  const tail = text.slice(pos).trim();
  if (tail) out.push({ kind: "text", text: tail });
  return out;
}

/**
 * `drivers` are the reasons largest first, as the copy picks them, and `needKeys` the five parts of school need, in
 * the order the box lists them. A reason text that does not contain every driver's sentence word for word is shown
 * whole, as one paragraph, rather than cut wrongly.
 */
export function whyBlocks<K extends string>(
  text: string,
  drivers: readonly DriverLike<K>[],
  needKeys: readonly K[]
): Why<K> {
  const split = pieces(text, drivers);
  if (!split) return { lead: text, blocks: [] };
  const lead = split[0]?.kind === "text" ? (split.shift() as { text: string }).text : "";
  const blocks: WhyBlock<K>[] = [];
  const sizeOf = (driver: DriverLike<K>) => drivers.indexOf(driver) + 1;
  for (let i = 0; i < split.length;) {
    const piece = split[i];
    if (piece.kind === "text") {
      blocks.push({ kind: "text", text: piece.text });
      i += 1;
      continue;
    }
    if (needKeys.includes(piece.driver.key)) {
      const named = new Map<K, { n: number; sentence: string }>();
      while (i < split.length) {
        const next = split[i];
        if (next.kind !== "driver" || !needKeys.includes(next.driver.key)) break;
        named.set(next.driver.key, { n: sizeOf(next.driver), sentence: next.driver.sentence });
        i += 1;
      }
      const numbered = [...named.keys()].sort((a, b) => named.get(a)!.n - named.get(b)!.n);
      const order = [...numbered, ...needKeys.filter((key) => !named.has(key))];
      blocks.push({
        kind: "need",
        parts: order.map((key) => ({
          key,
          n: named.get(key)?.n ?? null,
          sentence: named.get(key)?.sentence ?? null,
        })),
      });
      continue;
    }
    blocks.push({
      kind: "reason",
      key: piece.driver.key,
      n: sizeOf(piece.driver),
      sentence: piece.driver.sentence,
    });
    i += 1;
  }
  return { lead, blocks };
}
