"use client";

import dynamic from "next/dynamic";

import { LAYOUT } from "@/lib/screening/copy";
import type { MapCanvasProps } from "./MapCanvas";
import styles from "./screening.module.css";

export type { MapCanvasProps as ScreeningMapProps } from "./MapCanvas";

function MapLoading() {
  return (
    <div className={`${styles.map} ${styles.mapLoading}`} role="status">
      {LAYOUT.mapLoading}
    </div>
  );
}

/**
 * The map, loaded in the browser only. deck.gl and MapLibre stay out of the route's initial JavaScript, which
 * `npm run bundle:check` holds to its budget; importing MapCanvas anywhere else in the route would break it.
 */
const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false, loading: MapLoading });

/**
 * Nothing is fetched for the map until `load` is true. The page sets it once the list has been painted, so the
 * map's roughly 430 KiB (gzip) of script and its first draw never compete with the data and the list the user
 * came for, on a slow link or a slow laptop.
 */
export function ScreeningMap({ load, ...props }: MapCanvasProps & { load: boolean }) {
  return load ? <MapCanvas {...props} /> : <MapLoading />;
}
