"use client";

import { Marker } from "@vis.gl/react-maplibre";

import { LABELLED_PLACES, type MapSchool, numberOnMark } from "@/lib/screening/marks";

import styles from "./screening.module.css";

/**
 * The numbers on the first ten dots, as page text laid over the map. A deck.gl text layer would be a second GPU
 * program plus a font atlas, compiled before the map's first frame; on a computer without a real graphics card
 * that stalls the page for a third of a second or more. Ten labels cost the browser next to nothing.
 * They ignore the pointer, so picking and hovering still reach the dots underneath, and assistive technology,
 * since the list states every place in order. Each label's stacking comes from its place, not from where it sits
 * in the page, so where two dots overlap the earlier place's number stays on top, over its own dot, even after the
 * rule changes and the map redraws the labels.
 */
export function RankLabels({ schools, stale }: { schools: readonly MapSchool[]; stale: boolean }) {
  const labelled = schools
    .map((school) => ({ school, rank: numberOnMark(school.mark) }))
    .filter((label): label is { school: MapSchool; rank: number } => label.rank !== null);
  return labelled.map(({ school, rank }) => (
    <Marker
      key={school.key}
      longitude={school.lon}
      latitude={school.lat}
      anchor="center"
      className={styles.rankLabel}
      style={{ zIndex: LABELLED_PLACES + 1 - rank }}
    >
      <span data-rank-label={rank} data-stale={stale} aria-hidden="true">
        {rank}
      </span>
    </Marker>
  ));
}
