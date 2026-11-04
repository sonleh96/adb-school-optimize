"use client";

import { Marker, useMap } from "@vis.gl/react-maplibre";
import { useEffect, useMemo, useState } from "react";

import { LABELLED_PLACES, type MapSchool, RAMP_RADIUS, numberOnMark } from "@/lib/screening/marks";
import { type NumberSpot, layOutNumbers } from "@/lib/screening/rank-labels";

import styles from "./screening.module.css";

const ON_THE_DOT: NumberSpot = { rank: 0, dx: 0, dy: 0 };

/**
 * The numbers on the first ten dots, as page text laid over the map. A deck.gl text layer would be a second GPU
 * program plus a font atlas, compiled before the map's first frame; on a computer without a real graphics card
 * that stalls the page for a third of a second or more. Ten labels cost the browser next to nothing.
 * They ignore the pointer, so picking and hovering still reach the dots underneath, and assistive technology,
 * since the list states every place in order. Each label's stacking comes from its position, not from where it sits
 * in the page, so where two dots overlap the earlier place's number stays on top, over its own dot, even after the
 * rule changes and the map redraws the labels.
 * Where dots crowd, a later place's number moves beside its dot with a leader (lib/screening/rank-labels.ts). The
 * layout is redone whenever the map stops moving or changes size, since zooming changes which dots crowd.
 */
export function RankLabels({ schools, stale }: { schools: readonly MapSchool[]; stale: boolean }) {
  const { current: map } = useMap();
  const labelled = useMemo(
    () =>
      schools
        .map((school) => ({ school, rank: numberOnMark(school.mark) }))
        .filter((label): label is { school: MapSchool; rank: number } => label.rank !== null),
    [schools]
  );
  const [spots, setSpots] = useState<readonly NumberSpot[]>([]);
  useEffect(() => {
    const instance = map?.getMap();
    if (!instance) return;
    const layOut = () => {
      const points = labelled.map(({ school, rank }) => {
        const { x, y } = instance.project([school.lon, school.lat]);
        return { rank, x, y };
      });
      const container = instance.getContainer();
      const unnumbered = schools
        .filter((school) => numberOnMark(school.mark) === null)
        .map((school) => instance.project([school.lon, school.lat]));
      const next = layOutNumbers(points, container.clientWidth, container.clientHeight, unnumbered);
      setSpots((previous) =>
        previous.length === next.length &&
        previous.every((p, i) => p.rank === next[i].rank && p.dx === next[i].dx && p.dy === next[i].dy)
          ? previous
          : next
      );
    };
    layOut();
    instance.on("moveend", layOut);
    instance.on("resize", layOut);
    return () => {
      instance.off("moveend", layOut);
      instance.off("resize", layOut);
    };
  }, [map, labelled, schools]);

  return labelled.map(({ school, rank }) => {
    const { dx, dy } = spots.find((spot) => spot.rank === rank) ?? ON_THE_DOT;
    const moved = dx !== 0 || dy !== 0;
    return (
      <Marker
        key={school.key}
        longitude={school.lon}
        latitude={school.lat}
        anchor="center"
        offset={[dx, dy]}
        className={styles.rankLabel}
        style={{ zIndex: LABELLED_PLACES + 1 - rank }}
      >
        {moved ? (
          // From the number's centre back to the edge of its dot: the first ten dots all take the first band's size.
          <i
            className={styles.rankLeader}
            data-stale={stale}
            style={{
              width: Math.hypot(dx, dy) - RAMP_RADIUS[0],
              transform: `rotate(${Math.atan2(-dy, -dx)}rad)`,
            }}
            aria-hidden="true"
          />
        ) : null}
        <span data-rank-label={rank} data-moved={moved || undefined} data-stale={stale} aria-hidden="true">
          {rank}
        </span>
      </Marker>
    );
  });
}
