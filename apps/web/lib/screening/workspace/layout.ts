/**
 * The layout of the workspace, decided in one place from the viewport and what is open (notes/final.md,
 * "Responsive layout"). The stylesheet sets the same widths by media query, so the first paint is right before any
 * script runs; this function is what the map's framing and the layout attributes read.
 *
 * | Width        | Mode    | Column | Card | The list steps aside while a card is open          |
 * | 1440 and up  | wide    | 416    | 392  | when the map would fall under 480 px               |
 * | 1280 to 1439 | desktop | 384    | 360  | when the map would fall under 480 px               |
 * | 1024 to 1279 | compact | 360    | 360  | always                                             |
 * | under 1024   | narrow  | full   | full | always: the card replaces the list under the map   |
 */
export type LayoutMode = "wide" | "desktop" | "compact" | "narrow";

export const MIN_MAP = 480;
export const GAP = 16;
export const BREAKPOINTS = { wide: 1440, desktop: 1280, compact: 1024 } as const;
const WIDTHS: Record<Exclude<LayoutMode, "narrow">, { column: number; card: number }> = {
  wide: { column: 416, card: 392 },
  desktop: { column: 384, card: 360 },
  compact: { column: 360, card: 360 },
};
/**
 * The narrow layout's top bar and the share of the window its map band takes. A short window (a laptop at 200
 * percent zoom is 800 by 500) gives the band less, so the list region still shows its first school without a scroll.
 */
export const TOP_BAR = 56;
const SHORT = 600;
const BAND = { share: 0.4, min: 200 };
const BAND_SHORT = { share: 0.32, min: 160 };

export interface Layout {
  readonly mode: LayoutMode;
  /** Panel widths; 0 in the narrow layout, where panels run the full width. */
  readonly column: number;
  readonly card: number;
  /** A card is open and the list has stepped aside for it. */
  readonly docked: boolean;
  /** The key shows only its title and a Key disclosure. */
  readonly keyCollapsed: boolean;
  /** The key's three mark lines stack, each mark's words under its name. */
  readonly keyStacked: boolean;
  /** The narrow layout's map band height; null elsewhere. */
  readonly band: number | null;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly cardOpen: boolean;
  /** The guide rail's width when it is open; it arrives with the guides. */
  readonly rail?: number;
}

export function modeOf(width: number): LayoutMode {
  if (width >= BREAKPOINTS.wide) return "wide";
  if (width >= BREAKPOINTS.desktop) return "desktop";
  if (width >= BREAKPOINTS.compact) return "compact";
  return "narrow";
}

function bandHeight(height: number): number {
  const { share, min } = height < SHORT ? BAND_SHORT : BAND;
  return Math.max(min, Math.round(height * share));
}

export function layoutOf({ width, height, cardOpen, rail = 0 }: Viewport): Layout {
  const mode = modeOf(width);
  if (mode === "narrow") {
    return {
      mode,
      column: 0,
      card: 0,
      docked: cardOpen,
      keyCollapsed: true,
      keyStacked: true,
      band: bandHeight(height),
    };
  }
  const { column, card } = WIDTHS[mode];
  const mapWithCard = width - rail - column - card - 4 * GAP;
  return {
    mode,
    column,
    card,
    docked: cardOpen && (mode === "compact" || mapWithCard < MIN_MAP),
    keyCollapsed: mode === "compact",
    keyStacked: mode !== "wide" || cardOpen,
    band: null,
  };
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Room kept at the map's foot before the key and the caveat have been measured. */
const FOOT_GUESS = 140;

/**
 * The part of the map no panel covers, as padding for framing and panning. `foot` is the height the key and the
 * caveat take from the map's bottom edge, measured on screen: the key's height follows its rule's title, its bands
 * and how its lines stack, and the caveat wraps with the width left to it.
 */
export function mapPadding(layout: Layout, cardOpen: boolean, foot: number | null = null): Padding {
  if (layout.mode === "narrow") return { top: 24, right: 24, bottom: 48, left: 24 };
  const left = layout.docked ? GAP + 40 : GAP + layout.column + 40;
  const right = cardOpen ? GAP + layout.card + 40 : 64;
  return { top: 80, right, bottom: foot === null ? FOOT_GUESS : foot + GAP, left };
}

/** The least of the map a fit leaves clear on each axis, however much the panels cover. */
export const MIN_CLEAR = 64;

/**
 * `padding` cut to what a map of `width` by `height` can hold: on an axis where the two sides would leave less than
 * `MIN_CLEAR`, both shrink in proportion. The map is briefly narrower than the layout expects while the rail opens or
 * the list steps aside, and a fit asked for more room than the map has is skipped (MapLibre warns) instead of made.
 */
export function fitPadding(padding: Padding, width: number, height: number): Padding {
  const axis = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - MIN_CLEAR);
    if (a + b <= room) return [a, b];
    const scale = a + b > 0 ? room / (a + b) : 0;
    return [Math.floor(a * scale), Math.floor(b * scale)];
  };
  const [left, right] = axis(padding.left, padding.right, width);
  const [top, bottom] = axis(padding.top, padding.bottom, height);
  return { top, right, bottom, left };
}

/**
 * How far a school's point sits from the map's centre when it is centred in the clear part `padding` leaves. Moving
 * the map with this offset, not with `padding`, leaves the map's own padding at zero; MapLibre keeps a move's padding
 * and adds it to every later fit's, so a later fit would ask for the clear part twice.
 */
export const clearCentreOffset = (padding: Padding): [number, number] => [
  (padding.left - padding.right) / 2,
  (padding.top - padding.bottom) / 2,
];
