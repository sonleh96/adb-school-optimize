import { ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

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
 * While another rule's rows are still showing (`stale`) the marks fade and cannot be picked.
 */
export function buildMarkLayers(schools: readonly MapSchool[], stale: boolean): Layer[] {
  const pickable = !stale;
  const opacity = stale ? 0.4 : 1;
  const incomplete = schools.filter((s) => s.mark.kind === "incomplete");
  const ranges = schools.filter((s) => s.mark.kind === "range");
  const dots = schools.filter(isDot).sort((a, b) => b.mark.rank - a.mark.rank);

  return [
    new ScatterplotLayer<MapSchool>({
      id: "incomplete",
      data: incomplete,
      pickable,
      opacity,
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
      id: "range",
      data: ranges,
      pickable,
      opacity,
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
      id: "range-centre",
      data: ranges,
      opacity,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: () => 2,
      getFillColor: () => RING_INK,
    }),
    new ScatterplotLayer<Dot>({
      id: "dots",
      data: dots,
      pickable,
      opacity,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: (s) => RAMP_RADIUS[s.mark.step],
      filled: true,
      getFillColor: (s) => RAMP[s.mark.step],
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 1.5,
      getLineColor: PAPER,
    }),
  ];
}

/** The selection ring, and a lighter ring under the pointer. They change on every hover, so they stay apart. */
export function buildRingLayers(selected: MapSchool | null, hovered: MapSchool | null): Layer[] {
  const layers: Layer[] = [];
  const ring = (id: string, school: MapSchool | null, width: number, alpha: number, gap: number) =>
    new ScatterplotLayer<MapSchool>({
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
