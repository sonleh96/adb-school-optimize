"use client";

import { Marker } from "@vis.gl/react-maplibre";

import { type MapSchool, numberOnMark } from "@/lib/screening/marks";

import styles from "./screening.module.css";

/**
 * The numbers on the first ten dots, as page text laid over the map. A deck.gl text layer would be a second GPU
 * program plus a font atlas, compiled before the map's first frame; on a computer without a real graphics card
 * that stalls the page for a third of a second or more. Ten labels cost the browser next to nothing.
 * They ignore the pointer, so picking and hovering still reach the dots underneath.
 */
export function RankLabels({ schools, stale }: { schools: readonly MapSchool[]; stale: boolean }) {
  return schools.map((school) => {
    const rank = numberOnMark(school.mark);
    if (rank === null) return null;
    return (
      <Marker
        key={school.key}
        longitude={school.lon}
        latitude={school.lat}
        anchor="center"
        className={styles.rankLabel}
      >
        <span data-rank-label={rank} data-stale={stale}>
          {rank}
        </span>
      </Marker>
    );
  });
}
