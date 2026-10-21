import { ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

import type { MarkPaint } from "@/lib/screening/method/paint";
import type { MapLayer } from "@/lib/screening/workspace/state";
import {
  INCOMPLETE_RING_HEX,
  MARK_PAPER_HEX,
  RAMP_HEX,
  RAMP_RADIUS,
  RANGE_RING_HEX,
  type MapSchool,
} from "@/lib/screening/marks";

type Color = [number, number, number, number];

/** The design's tokens as map colours: the place ramp, the ink of the rings and the panel paper. */
const rgba = (hex: string): Color => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  255,
];
const RAMP: Color[] = RAMP_HEX.map(rgba);
const PAPER = rgba(MARK_PAPER_HEX);
const RING_INK = rgba(RANGE_RING_HEX);
const INCOMPLETE_INK = rgba(INCOMPLETE_RING_HEX);
const INCOMPLETE_FILL: Color = [PAPER[0], PAPER[1], PAPER[2], 230];
const SELECTION_INK: Color = [21, 24, 29, 255];
const RANGE_RADIUS = 6.5;
const INCOMPLETE_RADIUS = 3.5;

type Dot = MapSchool & { mark: { kind: "dot"; rank: number; step: number } };
const isDot = (school: MapSchool): school is Dot => school.mark.kind === "dot";

export function radiusOf(school: MapSchool): number {
  switch (school.mark.kind) {
    case "dot":
      return RAMP_RADIUS[school.mark.step];
    case "range":
      return RANGE_RADIUS;
    case "incomplete":
      return INCOMPLETE_RADIUS;
  }
}

const position = (school: MapSchool): [number, number] => [school.lon, school.lat];

/**
 * The map draws its own layers into a depth buffer, and deck.gl's layers sit among them. Without these settings a
 * dot on the coast loses the half that hangs over the sea, because the water polygons were drawn nearer. Every layer
 * has the same settings, so they still share one GPU pipeline.
 */
const ON_TOP = { parameters: { depthWriteEnabled: false, depthCompare: "always" as const } };

/*
 * Every layer here gives its radius and its fill colour as a function, even where all marks share one value.
 * deck.gl feeds a constant to the GPU differently from a per-mark value, and each way is a separate GPU pipeline,
 * compiled the first time it draws. Without a graphics card that compile stalls the page for hundreds of
 * milliseconds, so layers that all read the same way share one compile instead of paying for two.
 * (A Linux container with software GL: first map frame 650 ms with constants, 390 ms without.)
 */

/**
 * The marks, bottom to top. A better place is never covered by a worse one: dots go worst first.
 * The numbers on the first ten dots are not drawn here (see RankLabels).
 * While another rule's rows are still showing (`stale`) the marks fade and cannot be picked. While the incomplete
 * records are the list on screen, the schools with a place step back so the empty rings carry the map.
 */
export function buildMarkLayers(
  schools: readonly MapSchool[],
  stale: boolean,
  emphasis: "all" | "incomplete" = "all",
  paint?: MarkPaint
): Layer[] {
  const pickable = !stale;
  const opacity = stale ? 0.4 : 1;
  const placedOpacity = stale ? 0.4 : emphasis === "incomplete" ? 0.3 : 1;
  const hidden = paint?.hidden ?? [];
  // The method details fade the schools outside the filters, and in compare mode colour each dot by its move.
  // A faded school is drawn in its own layers with a lower layer opacity, not with a per-mark colour, so every
  // accessor keeps its kind and the map compiles no second GPU pipeline (see the note above).
  const faint = paint?.faint ?? null;
  const moves = paint?.moves ?? null;
  const moveOf = (s: MapSchool) => moves?.get(s.key) ?? null;
  const shown = (kind: MapLayer, keep: (s: MapSchool) => boolean) =>
    hidden.includes(kind) ? [] : schools.filter(keep);
  const groups: [string, (s: MapSchool) => boolean, number][] = faint
    ? [
        ["", (s) => !faint.has(s.key), 1],
        ["-faint", (s) => faint.has(s.key), 0.18],
      ]
    : [["", () => true, 1]];

  return groups.flatMap(([suffix, inGroup, fade]) => {
    const incomplete = shown("queue", (s) => s.mark.kind === "incomplete" && inGroup(s));
    const ranges = shown("range", (s) => s.mark.kind === "range" && inGroup(s));
    const dots = (shown("ranked", (s) => isDot(s) && inGroup(s)) as Dot[]).sort((a, b) =>
      moves
        ? Number(moveOf(a)?.top ?? false) - Number(moveOf(b)?.top ?? false) || b.mark.rank - a.mark.rank
        : b.mark.rank - a.mark.rank
    );
    return [
      new ScatterplotLayer<MapSchool>({
        ...ON_TOP,
        id: `incomplete${suffix}`,
        data: incomplete,
        pickable,
        opacity: opacity * fade,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: () => INCOMPLETE_RADIUS,
        filled: true,
        getFillColor: () => INCOMPLETE_FILL,
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
        getLineColor: INCOMPLETE_INK,
      }),
      new ScatterplotLayer<MapSchool>({
        ...ON_TOP,
        id: `range${suffix}`,
        data: ranges,
        pickable,
        opacity: placedOpacity * fade,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: () => RANGE_RADIUS,
        filled: true,
        getFillColor: () => PAPER,
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
        getLineColor: RING_INK,
      }),
      new ScatterplotLayer<MapSchool>({
        ...ON_TOP,
        id: `range-centre${suffix}`,
        data: ranges,
        opacity: placedOpacity * fade,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: () => 2,
        getFillColor: () => RING_INK,
      }),
      new ScatterplotLayer<Dot>({
        ...ON_TOP,
        id: `dots${suffix}`,
        data: dots,
        pickable,
        opacity: placedOpacity * fade,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: (s) => {
          const move = moveOf(s);
          return move ? (move.top ? 6.5 : 4) : RAMP_RADIUS[s.mark.step];
        },
        filled: true,
        getFillColor: (s) => {
          const move = moveOf(s);
          return move ? rgba(move.hex) : RAMP[s.mark.step];
        },
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
        getLineColor: PAPER,
        updateTriggers: { getRadius: [moves], getFillColor: [moves] },
      }),
    ];
  });
}

/** The selection ring, and a lighter ring under the pointer. They change on every hover, so they stay apart. */
export function buildRingLayers(selected: MapSchool | null, hovered: MapSchool | null): Layer[] {
  const layers: Layer[] = [];
  const ring = (id: string, school: MapSchool | null, width: number, alpha: number, gap: number) =>
    new ScatterplotLayer<MapSchool>({
      ...ON_TOP,
      id,
      data: school ? [school] : [],
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: (s) => radiusOf(s) + gap,
      getFillColor: () => SELECTION_INK,
      filled: false,
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: width,
      getLineColor: [SELECTION_INK[0], SELECTION_INK[1], SELECTION_INK[2], alpha],
      updateTriggers: { getRadius: [school?.key] },
    });
  if (hovered && hovered.key !== selected?.key) layers.push(ring("hover-ring", hovered, 1.5, 200, 3));
  layers.push(ring("selection-ring", selected, 2, 255, 4.5));
  return layers;
}
