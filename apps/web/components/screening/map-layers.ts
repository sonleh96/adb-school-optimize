import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

import {
  INCOMPLETE_RING_HEX,
  LABELLED_PLACES,
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

/** Fonts the label atlas can rely on without waiting for a web font to arrive. */
const LABEL_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * The marks, bottom to top. A better place is never covered by a worse one:
 * dots go worst first, and each of the first ten is a dot with its own number, again worst first.
 * While another rule's rows are still showing (`stale`) the marks fade and cannot be picked.
 */
export function buildMarkLayers(schools: readonly MapSchool[], stale: boolean): Layer[] {
  const pickable = !stale;
  const opacity = stale ? 0.4 : 1;
  const incomplete = schools.filter((s) => s.mark.kind === "incomplete");
  const ranges = schools.filter((s) => s.mark.kind === "range");
  const dots = schools.filter(isDot).sort((a, b) => b.mark.rank - a.mark.rank);
  const rest = dots.filter((s) => s.mark.rank > LABELLED_PLACES);
  const labelled = dots.filter((s) => s.mark.rank <= LABELLED_PLACES);

  const layers: Layer[] = [
    new ScatterplotLayer<MapSchool>({
      id: "incomplete",
      data: incomplete,
      pickable,
      opacity,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: INCOMPLETE_RADIUS,
      filled: true,
      getFillColor: [PAPER[0], PAPER[1], PAPER[2], 230],
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
      getRadius: RANGE_RADIUS,
      filled: true,
      getFillColor: PAPER,
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
      getRadius: 2,
      getFillColor: RING_INK,
    }),
    new ScatterplotLayer<Dot>({
      id: "dots",
      data: rest as Dot[],
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

  for (const school of labelled as Dot[]) {
    layers.push(
      new ScatterplotLayer<Dot>({
        id: `first-${school.mark.rank}`,
        data: [school],
        pickable,
        opacity,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: RAMP_RADIUS[0],
        filled: true,
        getFillColor: RAMP[0],
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
        getLineColor: PAPER,
      }),
      new TextLayer<Dot>({
        id: `first-${school.mark.rank}-number`,
        data: [school],
        opacity,
        getPosition: position,
        getText: (s) => String(s.mark.rank),
        characterSet: "0123456789",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        getSize: 10,
        sizeUnits: "pixels",
        getColor: PAPER,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
      })
    );
  }

  return layers;
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
