/**
 * The guidance layers' state: the guide rail (which guide, which step, presenting), the How this works page, help
 * mode, its card and the glossary. One typed record and one reducer, so every rule that ties them together (Page Down
 * at a last step opens the next guide, Skip at a last step counts the guide as seen, presenting ends with the rail)
 * lives here and nowhere else.
 *
 * The layers never change the workspace directly. When the rail lands on a step the screen must be set for, `apply`
 * changes, and the rail sets the workspace through its controller (notes/final.md, "Region and setState contract").
 *
 * What a person has seen is `Memory`, kept in local storage: a returning user starts with the rail closed and the
 * Guides button says how many guides they have seen, so nobody is taught twice.
 */

export const GUIDE_IDS = ["q1", "q2", "q3", "q4", "q5"] as const;
export type GuideId = (typeof GUIDE_IDS)[number];
export const isGuideId = (value: unknown): value is GuideId =>
  typeof value === "string" && (GUIDE_IDS as readonly string[]).includes(value);

export type Rail =
  | { readonly kind: "off" }
  | { readonly kind: "start" }
  | { readonly kind: "step"; readonly guide: GuideId; readonly step: number };

/** A help card: a term, a rule, the place of a school, or one of the two comparison notes. */
export type CardId = `term:${string}` | `rule:${string}` | `place:${string}` | "compare" | "compare-main";

export interface Glossary {
  readonly open: boolean;
  /** The search text. */
  readonly q: string;
  /** The entry shown open: a term key or `rule:<id>`. */
  readonly x: string | null;
}

export interface LayerState {
  readonly rail: Rail;
  /** Presentation mode: presenter type, the wider rail, Up next and the key hints. Only while a guide runs. */
  readonly present: boolean;
  readonly page: "how" | null;
  readonly help: boolean;
  readonly card: CardId | null;
  readonly gloss: Glossary;
  /**
   * Changes each time the rail lands on a step the screen must be set for: a guide opened, Next, Back, a link that
   * names a step. `fresh` asks the rail to start again from the guide's own example school.
   */
  readonly apply: { readonly seq: number; readonly fresh: boolean };
}

export interface Memory {
  /** The person has opened or closed the guides before. */
  readonly seen: boolean;
  /** Guides finished or skipped at their last step. */
  readonly done: readonly GuideId[];
  /** Where an unfinished guide was left. */
  readonly last: { readonly guide: GuideId; readonly step: number } | null;
}

export interface Model {
  readonly state: LayerState;
  readonly memory: Memory;
}

/** The guides the loaded data can teach, in order, with how many steps each has. `null` until the data is known. */
export type Catalog = readonly { readonly id: GuideId; readonly steps: number }[];

export const CLOSED_GLOSSARY: Glossary = Object.freeze({ open: false, q: "", x: null });
export const EMPTY_MEMORY: Memory = Object.freeze({ seen: false, done: [], last: null });

export const INITIAL_STATE = Object.freeze<LayerState>({
  rail: { kind: "off" },
  present: false,
  page: null,
  help: false,
  card: null,
  gloss: CLOSED_GLOSSARY,
  apply: { seq: 0, fresh: true },
});

export type LayerEvent =
  /** The map bar's Guides button: open the start, or close whatever the rail shows. */
  | { readonly type: "toggleGuides" }
  | { readonly type: "openGuide"; readonly guide: GuideId }
  | { readonly type: "allGuides" }
  /** Explore on my own, Close guides. */
  | { readonly type: "close" }
  | { readonly type: "next" }
  | { readonly type: "back" }
  /** What a presentation clicker sends. Page Up crosses into the previous guide even when not presenting. */
  | { readonly type: "pageDown" }
  | { readonly type: "pageUp" }
  | { readonly type: "skip" }
  | { readonly type: "present"; readonly on: boolean }
  /** Show this step again. */
  | { readonly type: "restore" }
  | { readonly type: "page"; readonly page: "how" | null }
  | { readonly type: "help"; readonly on: boolean }
  | { readonly type: "card"; readonly id: CardId | null }
  | { readonly type: "gloss"; readonly open: boolean; readonly q?: string; readonly x?: string | null };

const stepsOf = (catalog: Catalog, guide: GuideId) => catalog.find((g) => g.id === guide)?.steps ?? 0;
const indexOf = (catalog: Catalog, guide: GuideId) => catalog.findIndex((g) => g.id === guide);

const remember = (memory: Memory, patch: Partial<Memory>): Memory => ({ ...memory, ...patch });
const withDone = (memory: Memory, guide: GuideId): Memory =>
  memory.done.includes(guide)
    ? remember(memory, { last: null })
    : remember(memory, { done: [...memory.done, guide], last: null });

function land(model: Model, guide: GuideId, step: number, fresh: boolean): Model {
  const { state, memory } = model;
  return {
    state: {
      ...state,
      rail: { kind: "step", guide, step },
      page: null,
      apply: { seq: state.apply.seq + 1, fresh },
    },
    memory: remember(memory, { seen: true, last: { guide, step } }),
  };
}

function shut(model: Model): Model {
  return {
    state: { ...model.state, rail: { kind: "off" }, present: false },
    memory: remember(model.memory, { seen: true }),
  };
}

/** Next, or Page Down: the next step; past a guide's last step, the next guide; past the last guide, closed. */
function forward(model: Model, catalog: Catalog): Model {
  const { rail } = model.state;
  if (rail.kind !== "step") return model;
  const n = stepsOf(catalog, rail.guide);
  if (rail.step < n) return land(model, rail.guide, rail.step + 1, false);
  const finished = { ...model, memory: withDone(model.memory, rail.guide) };
  const next = catalog[indexOf(catalog, rail.guide) + 1];
  if (next) return land(finished, next.id, 1, true);
  return shut(finished);
}

/** Back, or Page Up: the previous step; at a first step, the previous guide's last step when `cross`. */
function backward(model: Model, catalog: Catalog, cross: boolean): Model {
  const { rail } = model.state;
  if (rail.kind !== "step") return model;
  if (rail.step > 1) return land(model, rail.guide, rail.step - 1, false);
  const previous = catalog[indexOf(catalog, rail.guide) - 1];
  if (!cross || !previous) return model;
  return land(model, previous.id, previous.steps, true);
}

/**
 * The state after `event`. `catalog` is null until the data says which guides it can teach; until then the rail
 * can open and close but not step.
 */
export function reduce(model: Model, event: LayerEvent, catalog: Catalog | null): Model {
  const { state } = model;
  switch (event.type) {
    case "toggleGuides":
      if (state.rail.kind === "off") return { ...model, state: { ...state, rail: { kind: "start" } } };
      return shut(model);
    case "openGuide":
      if (catalog && stepsOf(catalog, event.guide) === 0) return model;
      return land(model, event.guide, 1, true);
    case "allGuides":
      return { ...model, state: { ...state, rail: { kind: "start" }, present: false } };
    case "close":
      return shut(model);
    case "next":
    case "pageDown":
      return catalog ? forward(model, catalog) : model;
    case "back":
      return catalog ? backward(model, catalog, state.present) : model;
    case "pageUp":
      return catalog ? backward(model, catalog, true) : model;
    case "skip": {
      if (state.rail.kind !== "step" || !catalog) return shut(model);
      const last = state.rail.step >= stepsOf(catalog, state.rail.guide);
      return shut(last ? { ...model, memory: withDone(model.memory, state.rail.guide) } : model);
    }
    case "present":
      if (state.rail.kind !== "step") return model;
      return { ...model, state: { ...state, present: event.on } };
    case "restore":
      if (state.rail.kind !== "step") return model;
      return { ...model, state: { ...state, apply: { seq: state.apply.seq + 1, fresh: true } } };
    case "page":
      return { ...model, state: { ...state, page: event.page } };
    case "help":
      return { ...model, state: { ...state, help: event.on, card: event.on ? state.card : null } };
    case "card":
      return {
        ...model,
        state: { ...state, card: event.id, gloss: event.id ? { ...state.gloss, open: false } : state.gloss },
      };
    case "gloss": {
      const gloss: Glossary = event.open
        ? { open: true, q: event.q ?? state.gloss.q, x: event.x === undefined ? state.gloss.x : event.x }
        : CLOSED_GLOSSARY;
      return { ...model, state: { ...state, gloss, card: event.open ? null : state.card } };
    }
  }
}

/**
 * The state checked against the guides the data can teach: a guide it cannot teach (a link to the range guide on
 * data with no range school) falls back to the start list, and a step past a guide's end to its last step.
 */
export function revalidate(state: LayerState, catalog: Catalog): LayerState {
  const { rail } = state;
  if (rail.kind !== "step") return state;
  const n = stepsOf(catalog, rail.guide);
  if (n === 0) return { ...state, rail: { kind: "start" }, present: false };
  if (rail.step <= n) return state;
  return { ...state, rail: { ...rail, step: n } };
}

/* ------------------------------------------------------------------ the URL */

/** The URL keys the guidance layers own; the workspace keeps every other key. */
export const LAYER_KEYS = ["guide", "gstep", "present", "page", "help", "card", "gloss", "gq", "gx"] as const;

const CARD = /^(term|rule|place):[^\s]+$|^compare(-main)?$/;
export const isCardId = (value: unknown): value is CardId => typeof value === "string" && CARD.test(value);

/**
 * The layers a URL describes. With no `guide` key the rail follows memory: open on a first visit, closed for a
 * returning user. A link that names a step lands on it, with the screen set for it.
 */
export function stateFromSearch(search: string, memory: Memory): LayerState {
  const params = new URLSearchParams(search);
  const guide = params.get("guide");
  const stepText = params.get("gstep");
  const step = stepText && /^\d+$/.test(stepText) ? Math.max(1, Number(stepText)) : 1;
  let rail: Rail;
  if (guide === "off") rail = { kind: "off" };
  else if (guide === "start") rail = { kind: "start" };
  else if (isGuideId(guide)) rail = { kind: "step", guide, step };
  else rail = memory.seen ? { kind: "off" } : { kind: "start" };
  const card = params.get("card");
  const glossOpen = params.get("gloss") === "1";
  return {
    rail,
    present: rail.kind === "step" && params.get("present") === "1",
    page: params.get("page") === "how" ? "how" : null,
    help: params.get("help") === "1",
    card: isCardId(card) ? card : null,
    gloss: glossOpen
      ? { open: true, q: params.get("gq") ?? "", x: params.get("gx") || null }
      : CLOSED_GLOSSARY,
    apply: { seq: rail.kind === "step" ? 1 : 0, fresh: true },
  };
}

/** `search` with the layer keys replaced by `state`'s and every other key kept as it was. */
export function searchWithLayers(search: string, state: LayerState): string {
  const params = new URLSearchParams(search);
  for (const key of LAYER_KEYS) params.delete(key);
  const { rail } = state;
  if (rail.kind === "start") params.set("guide", "start");
  if (rail.kind === "step") {
    params.set("guide", rail.guide);
    params.set("gstep", String(rail.step));
    if (state.present) params.set("present", "1");
  }
  if (state.page) params.set("page", state.page);
  if (state.help) params.set("help", "1");
  if (state.card) params.set("card", state.card);
  if (state.gloss.open) {
    params.set("gloss", "1");
    if (state.gloss.q) params.set("gq", state.gloss.q);
    if (state.gloss.x) params.set("gx", state.gloss.x);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/* ------------------------------------------------------------------ memory */

export const MEMORY_KEY = "rise-screening-guides-v1";

/** What local storage held, read defensively: anything malformed is a first visit. */
export function parseMemory(text: string | null): Memory {
  if (!text) return EMPTY_MEMORY;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return EMPTY_MEMORY;
    const done = Array.isArray(raw.done) ? raw.done.filter(isGuideId) : [];
    const last = raw.last as Record<string, unknown> | null | undefined;
    return {
      seen: raw.seen === true,
      done: [...new Set(done)],
      last:
        last && isGuideId(last.guide) && Number.isInteger(last.step) && (last.step as number) >= 1
          ? { guide: last.guide, step: last.step as number }
          : null,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

/** A guide's line in the start list: seen, where it was left, or how many steps it has. */
export type GuideStatus =
  | { readonly kind: "seen" }
  | { readonly kind: "left"; readonly step: number; readonly of: number }
  | { readonly kind: "new"; readonly steps: number };

export function statusOf(memory: Memory, guide: GuideId, steps: number): GuideStatus {
  if (memory.done.includes(guide)) return { kind: "seen" };
  if (memory.last?.guide === guide && memory.last.step > 1 && memory.last.step <= steps)
    return { kind: "left", step: memory.last.step, of: steps };
  return { kind: "new", steps };
}

/** How many of the guides the data can teach this person has seen. */
export const seenCount = (memory: Memory, catalog: Catalog): number =>
  catalog.filter((g) => memory.done.includes(g.id)).length;
