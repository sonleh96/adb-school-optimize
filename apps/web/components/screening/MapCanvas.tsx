"use client";

/**
 * The one module that knows deck.gl and MapLibre. It is loaded only in the browser (see ScreeningMap.tsx), so
 * neither library is part of the route's initial JavaScript. One map is created for the life of the page;
 * rule changes and selections only change layers.
 */
import "maplibre-gl/dist/maplibre-gl.css";

import { MapLibreOverlay, type MapLibreOverlayProps } from "@deck.gl/maplibre";
import type { PickingInfo } from "@deck.gl/core";
import { Map as MapView, NavigationControl, useControl, type MapRef } from "@vis.gl/react-maplibre";
import { setWorkerUrl, type Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type MapSchool, boundsOf } from "@/lib/screening/marks";
import type { SchoolKey } from "@/lib/screening/types";

import { buildMarkLayers, buildRingLayers } from "./map-layers";
import styles from "./screening.module.css";

/** The light vector basemap. It needs no key. Override it with NEXT_PUBLIC_SCREENING_BASEMAP_STYLE. */
const BASEMAP_STYLE =
  process.env.NEXT_PUBLIC_SCREENING_BASEMAP_STYLE ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const TEST_HOOKS = process.env.NEXT_PUBLIC_SCREENING_TEST_HOOKS === "true";

// MapLibre 6 looks for its worker next to its own file, which a bundler moves. The bundler emits the worker as a
// static asset and this tells MapLibre where it went. Must run before the first map is created.
setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** Papua New Guinea, before any school is known. */
const DEFAULT_VIEW = { longitude: 147, latitude: -6.5, zoom: 4.8 };

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapCanvasProps {
  schools: readonly MapSchool[];
  selectedKey: SchoolKey | null;
  onSelect: (key: SchoolKey) => void;
  /** Space the panels take, so the first view and a pan keep marks out from under them. */
  padding: Padding;
}

interface Hover {
  school: MapSchool;
  x: number;
  y: number;
}

declare global {
  interface Window {
    /** Present only in builds made with NEXT_PUBLIC_SCREENING_TEST_HOOKS=true, for the browser tests. */
    __screeningMapTest?: {
      /** Viewport coordinates of a school's mark, or null when it is not on the map. */
      project: (key: SchoolKey) => { x: number; y: number } | null;
    };
  }
}

function Overlay(props: MapLibreOverlayProps) {
  // `_reuseDevices` is the documented workaround for the overlay under React StrictMode (deck.gl issue 10681).
  const overlay = useControl<MapLibreOverlay>(
    () => new MapLibreOverlay({ interleaved: true, deviceProps: { _reuseDevices: true }, ...props })
  );
  overlay.setProps(props);
  return null;
}

/** Quiet the basemap so the marks carry the map: no roads or buildings, soft water, muted place names. */
function calmBasemap(map: MapLibreMap) {
  const style = map.getStyle();
  const hidden =
    /^(road|tunnel|bridge|rail|aeroway|building|housenumber|roadname|poi|landuse|landcover|park|boundary_county|boundary_state|waterway|water_shadow|place_hamlet|place_suburbs|place_villages|place_country|place_state|place_continent)/;
  const paint = (
    id: string,
    name: Parameters<MapLibreMap["setPaintProperty"]>[1],
    value: string | number
  ) => {
    if (map.getLayer(id)) map.setPaintProperty(id, name, value);
  };
  for (const layer of style.layers) {
    if (hidden.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
  paint("background", "background-color", "#ece9e2");
  paint("water", "fill-color", "#dde3e8");
  for (const id of ["boundary_country_outline", "boundary_country_inner"]) paint(id, "line-color", "#c9c5bb");
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    if (layer.id.startsWith("watername")) {
      paint(layer.id, "text-color", "#9aa5ae");
      paint(layer.id, "text-halo-width", 0);
    } else if (layer.id.startsWith("place_")) {
      paint(layer.id, "text-color", "#8a867e");
      paint(layer.id, "text-halo-color", "rgba(251,250,247,0.9)");
      paint(layer.id, "text-halo-width", 1.2);
      paint(layer.id, "icon-opacity", 0.5);
    }
  }
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MapCanvas({ schools, selectedKey, onSelect, padding }: MapCanvasProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  const byKey = useMemo(() => new Map(schools.map((s) => [s.key, s])), [schools]);
  const selected = selectedKey ? (byKey.get(selectedKey) ?? null) : null;

  const markLayers = useMemo(() => buildMarkLayers(schools), [schools]);
  const ringLayers = useMemo(() => buildRingLayers(selected, hover?.school ?? null), [selected, hover]);
  const layers = useMemo(() => [...markLayers, ...ringLayers], [markLayers, ringLayers]);

  // The first view is decided once. If no school is known yet, the first schools to arrive set it.
  const [initialView] = useState(() => {
    const bounds = boundsOf(schools);
    return bounds ? { bounds, fitBoundsOptions: { padding, maxZoom: 9 } } : DEFAULT_VIEW;
  });
  const [fitted, setFitted] = useState("bounds" in initialView);
  useEffect(() => {
    const map = mapRef.current;
    const bounds = boundsOf(schools);
    if (!map || !bounds || fitted) return;
    map.fitBounds(bounds, { padding, maxZoom: 9, duration: 0 });
    setFitted(true);
  }, [schools, padding, fitted]);

  // A school chosen in the list is brought into the clear part of the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    const point = map.project([selected.lon, selected.lat]);
    const { width, height } = map.getContainer().getBoundingClientRect();
    const inside =
      point.x >= padding.left &&
      point.x <= width - padding.right &&
      point.y >= padding.top &&
      point.y <= height - padding.bottom;
    if (!inside) {
      map.easeTo({
        center: [selected.lon, selected.lat],
        padding,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    }
    // Panning on a click would be redundant: the mark is already inside, so this only runs for list picks.
  }, [selected, ready, padding]);

  useEffect(() => {
    if (!TEST_HOOKS || !ready) return;
    window.__screeningMapTest = {
      project: (key) => {
        const school = byKey.get(key);
        const map = mapRef.current;
        const container = containerRef.current;
        if (!school || !map || !container) return null;
        const point = map.project([school.lon, school.lat]);
        const rect = container.getBoundingClientRect();
        return { x: rect.left + point.x, y: rect.top + point.y };
      },
    };
    return () => {
      delete window.__screeningMapTest;
    };
  }, [ready, byKey]);

  const onHover = useCallback((info: PickingInfo<MapSchool>) => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = info.object ? "pointer" : "";
    setHover(info.object ? { school: info.object, x: info.x, y: info.y } : null);
  }, []);

  const onClick = useCallback(
    (info: PickingInfo<MapSchool>) => {
      if (info.object) onSelect(info.object.key);
    },
    [onSelect]
  );

  return (
    <div
      ref={containerRef}
      className={styles.map}
      data-testid="screening-map"
      data-map-ready={ready}
      data-map-moving={moving}
      data-selected-key={selectedKey ?? ""}
    >
      <MapView
        ref={mapRef}
        mapLib={import("maplibre-gl")}
        mapStyle={BASEMAP_STYLE}
        initialViewState={initialView}
        minZoom={3.5}
        maxZoom={13}
        renderWorldCopies={false}
        dragRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onMoveStart={() => setMoving(true)}
        onMoveEnd={() => setMoving(false)}
        onLoad={(event) => {
          calmBasemap(event.target);
          setReady(true);
        }}
      >
        <Overlay layers={layers} pickingRadius={4} onHover={onHover} onClick={onClick} />
        <NavigationControl position="top-left" showCompass={false} />
      </MapView>
      {hover ? (
        <div className={styles.tooltip} style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <strong>{hover.school.name}</strong>
          <span>{[hover.school.place, hover.school.province].filter(Boolean).join(" · ")}</span>
        </div>
      ) : null}
      <p className={styles.attribution}>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        ,{" "}
        <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
          © CARTO
        </a>
      </p>
    </div>
  );
}
