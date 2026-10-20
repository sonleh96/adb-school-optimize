"use client";

import dynamic from "next/dynamic";

import { COPY } from "./copy";
import styles from "./screening.module.css";

export type { MapCanvasProps as ScreeningMapProps } from "./MapCanvas";

/**
 * The map, loaded in the browser only. deck.gl and MapLibre stay out of the route's initial JavaScript, which
 * `npm run bundle:check` holds to its budget; importing MapCanvas anywhere else in the route would break it.
 */
export const ScreeningMap = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.map} ${styles.mapLoading}`} role="status">
      {COPY.mapLoading}
    </div>
  ),
});
