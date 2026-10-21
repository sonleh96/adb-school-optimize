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
import { setWorkerUrl, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { LAND_COLOUR, type MapSchool, WATER_COLOUR, boundsOf } from "@/lib/screening/marks";
import { type MarkPaint, NO_PAINT } from "@/lib/screening/method/paint";
import type { SchoolKey } from "@/lib/screening/types";
import { clearCentreOffset, fitPadding } from "@/lib/screening/workspace/layout";

import { LAYOUT } from "@/lib/screening/copy";
import { buildMarkLayers, buildRingLayers } from "./map-layers";
import { MapTooltip, type TipContent } from "./MapTooltip";
import { RankLabels } from "./RankLabels";
import styles from "./screening.module.css";

/** The light vector basemap. It needs no key. Override it with NEXT_PUBLIC_SCREENING_BASEMAP_STYLE. */
const BASEMAP_STYLE =
  process.env.NEXT_PUBLIC_SCREENING_BASEMAP_STYLE ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const TEST_HOOKS = process.env.NEXT_PUBLIC_SCREENING_TEST_HOOKS === "true";
/** What the map falls back to when the basemap cannot be loaded: plain land, so the marks still draw. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": LAND_COLOUR } }],
};

// MapLibre 6 looks for its worker next to its own file, which a bundler moves. The bundler emits the worker as a
// static asset and this tells MapLibre where it went. Must run before the first map is created.
setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** How far past the clear part's edge a mark still counts as inside it, in px. */
const EDGE_SLACK = 2;

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
  /** The marks belong to the previous rule while the new one loads: they fade and cannot be picked. */
  stale: boolean;
  /** Called after every frame; the first one drew the schools' marks, or the map alone when there are none. */
  onDrawn?: () => void;
  /** A school shown as if the pointer were on it (the workspace's `hover`, which the guides set). */
  hoverKey: SchoolKey | null;
  /** The school under the pointer, or null, so the list can mark its row. */
  onHoverChange: (key: SchoolKey | null) => void;
  /** What the tooltip says about a school, in the copy's words. */
  tipFor: (key: SchoolKey) => TipContent | null;
  /** Which marks carry the screen: all of them, or the incomplete records while their tab is open. */
  emphasis: "all" | "incomplete";
  /** Changes whenever the clear part of the map changes shape (the list steps aside or returns): frame it again. */
  frame: number;
  /** The last action came from the keyboard, or motion is reduced: move the map without animating. */
  instant: boolean;
  /** The map's accessible name and the basemap's credit, from the copy. */
  label: string;
  attribution: string;
  /** The method details' changes to the marks: layers off, schools outside the filters faint, compare colours. */
  paint?: MarkPaint;
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

type AttachedDevice = Parameters<NonNullable<MapLibreOverlayProps["onDeviceInitialized"]>>[0];

function Overlay(props: MapLibreOverlayProps) {
  const device = useRef<AttachedDevice | null>(null);
  const overlay = useControl<MapLibreOverlay>(
    () =>
      new MapLibreOverlay({
        interleaved: true,
        // React Strict Mode (development only) mounts the overlay twice; this is the documented workaround for
        // deck.gl issue 10681. It is left out of production, where it would keep every device alive.
        ...(process.env.NODE_ENV === "development" ? { deviceProps: { _reuseDevices: true } } : {}),
        ...props,
        onDeviceInitialized: (created) => {
          device.current = created;
        },
      })
  );
  overlay.setProps(props);

  // deck.gl attaches a luma device to MapLibre's WebGL context and never releases it. The device's canvas
  // observers then keep the canvas, the context and its GPU memory alive after the map is gone, one set for every
  // visit to the page. Release the device once its canvas has left the document (not on a Strict Mode remount,
  // where the canvas stays and the device is reused).
  useEffect(
    () => () => {
      const attached = device.current;
      device.current = null;
      if (!attached) return;
      setTimeout(() => {
        const canvas = attached.canvasContext?.canvas as HTMLCanvasElement | undefined;
        if (canvas && !canvas.isConnected) {
          attached.canvasContext?.destroy();
          attached.destroy();
        }
      }, 0);
    },
    []
  );
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
  paint("background", "background-color", LAND_COLOUR);
  paint("water", "fill-color", WATER_COLOUR);
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

function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a, window.location.href).href === new URL(b, window.location.href).href;
  } catch {
    return false;
  }
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The padding for a fit, cut to the map's size. The canvas is first brought to its container's size: it follows the
 * container on its own only a frame later, and while the rail opens it can still hold the old size.
 */
function fitFor(map: MapRef, padding: Padding): Padding {
  map.resize();
  const { clientWidth, clientHeight } = map.getContainer();
  return fitPadding(padding, clientWidth, clientHeight);
}

export default function MapCanvas({
  schools,
  selectedKey,
  onSelect,
  padding,
  stale,
  onDrawn,
  hoverKey,
  onHoverChange,
  tipFor,
  emphasis,
  frame,
  instant,
  label,
  attribution,
  paint = NO_PAINT,
}: MapCanvasProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [pointer, setPointer] = useState<SchoolKey | null>(null);
  const pointerKey = useRef<SchoolKey | null>(null);

  const byKey = useMemo(() => new Map(schools.map((s) => [s.key, s])), [schools]);
  const selected = selectedKey ? (byKey.get(selectedKey) ?? null) : null;

  const markLayers = useMemo(
    () => buildMarkLayers(schools, stale, emphasis, paint),
    [schools, stale, emphasis, paint]
  );
  // The pointer wins over the workspace's hover; while another rule's rows show, nothing is hovered.
  const hoveredKey = stale ? null : (pointer ?? hoverKey);
  const hovered = hoveredKey ? (byKey.get(hoveredKey) ?? null) : null;
  const ringLayers = useMemo(() => buildRingLayers(selected, hovered), [selected, hovered]);
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
    map.fitBounds(bounds, { padding: fitFor(map, padding), maxZoom: 9, duration: 0 });
    setFitted(true);
  }, [schools, padding, fitted]);

  const still = useCallback(() => instant || prefersReducedMotion(), [instant]);

  // Where the tooltip points: the hovered mark, measured once the map has settled.
  const [tipAt, setTipAt] = useState<{ x: number; y: number; width: number } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !hovered || moving) {
      setTipAt(null);
      return;
    }
    const point = map.project([hovered.lon, hovered.lat]);
    setTipAt({ x: point.x, y: point.y, width: map.getContainer().clientWidth });
  }, [hovered, ready, moving]);

  // Opening the card or the rail can restack the key, and the clear part is measured after that render, so the moves
  // below wait two frames and read the latest padding and schools.
  const latest = useRef({ padding, still, selected, schools });
  useLayoutEffect(() => {
    latest.current = { padding, still, selected, schools };
  });

  // A refit of the country, from the moment it is due until it settles (`fitting`), and the school chosen meanwhile
  // (`waiting`). The school waits instead of panning: a pan would stop the fit halfway, and the frame the fit lands on
  // already holds every school. It is shown once the last fit has settled.
  const fitting = useRef<object | null>(null);
  const waiting = useRef<(() => void) | null>(null);

  // When the clear part of the map changes shape (the list steps aside, the rail opens or closes), the country is
  // framed in it again. A pan under way is stopped by the fit, so whichever comes first, the fit has the last word.
  const framed = useRef(frame);
  useEffect(() => {
    const map = mapRef.current;
    if (framed.current === frame || !map || !boundsOf(latest.current.schools)) return;
    framed.current = frame;
    const fit = {};
    fitting.current = fit;
    // An earlier fit's end, fired as this one stops it, is not this one's.
    const settle = () => {
      if (fitting.current !== fit) return;
      fitting.current = null;
      const show = waiting.current;
      waiting.current = null;
      show?.();
    };
    let started = false;
    let step = requestAnimationFrame(() => {
      step = requestAnimationFrame(() => {
        started = true;
        const bounds = boundsOf(latest.current.schools);
        if (!bounds) return settle();
        map.fitBounds(bounds, {
          padding: fitFor(map, latest.current.padding),
          maxZoom: 9,
          duration: latest.current.still() ? 0 : 300,
        });
        if (map.isMoving()) map.once("moveend", settle);
        else settle();
      });
    });
    return () => {
      cancelAnimationFrame(step);
      if (started || fitting.current !== fit) return;
      // Cancelled before it moved. The next frame's effect, which runs straight after this, may start a fit that the
      // waiting school then waits on; if it does not (no map, no schools yet), nothing is running, so the school is
      // shown now rather than waiting for ever.
      fitting.current = null;
      queueMicrotask(() => {
        if (fitting.current !== null || !waiting.current) return;
        const show = waiting.current;
        waiting.current = null;
        show();
      });
    };
  }, [frame]);

  // A school chosen in the list is brought into the clear part of the map. This needs the map, not the basemap.
  // It runs when the selected school changes, and only then: a map the user has panned since stays where they left
  // it when the rows, the clear part or the last input change. While the map is still moving to an earlier choice,
  // where a mark sits says nothing about where it will settle, so the new school is gone to whatever its position
  // mid-pan. While the country is being framed again, the school waits for the fit and is moved only if the fit left
  // it outside the clear part.
  const selectedId = selected?.key ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const chosen = latest.current.selected;
    if (!map || !chosen || chosen.key !== selectedId) return;
    const midPan = map.isMoving() && fitting.current === null;
    const show = (force: boolean) => {
      const { padding: clear, still: instant, selected: now } = latest.current;
      // Not for a school no longer chosen, or a map that has gone.
      if (now?.key !== chosen.key || mapRef.current !== map) return;
      const point = map.project([chosen.lon, chosen.lat]);
      const { width, height } = map.getContainer().getBoundingClientRect();
      // The room a fit leaves, as the fit measured it: a fit puts the outermost schools on its edge, to a fraction of
      // a pixel, and such a school is inside.
      const room = fitPadding(clear, width, height);
      const inside =
        !force &&
        point.x >= room.left - EDGE_SLACK &&
        point.x <= width - room.right + EDGE_SLACK &&
        point.y >= room.top - EDGE_SLACK &&
        point.y <= height - room.bottom + EDGE_SLACK;
      if (!inside) {
        map.easeTo({
          center: [chosen.lon, chosen.lat],
          offset: clearCentreOffset(room),
          duration: instant() ? 0 : 400,
        });
      }
    };
    const after = () => show(false);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (fitting.current) waiting.current = after;
        else show(midPan);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (waiting.current === after) waiting.current = null;
    };
    // Panning on a click would be redundant: the mark is already inside, so this only runs for list picks.
  }, [selectedId]);

  useEffect(() => {
    if (!TEST_HOOKS) return;
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
  }, [byKey]);

  const onHover = useCallback(
    (info: PickingInfo<MapSchool>) => {
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = info.object ? "pointer" : "";
      const key = info.object?.key ?? null;
      // The parent hears of a change once, here in the event, never from inside a state update.
      if (pointerKey.current === key) return;
      pointerKey.current = key;
      setPointer(key);
      onHoverChange(key);
    },
    [onHoverChange]
  );

  // deck.gl calls this after every frame. The map is created only once the list, or its failure, is on screen, so
  // its first frame holds every mark the list has: none, for an empty or failed list. The controller waits for it.
  const afterRender = useCallback(() => onDrawn?.(), [onDrawn]);

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
      data-stale={stale}
      data-basemap={basemapFailed ? "failed" : "ok"}
      aria-busy={stale}
    >
      <MapView
        ref={mapRef}
        mapLib={import("maplibre-gl")}
        mapStyle={basemapFailed ? BLANK_STYLE : BASEMAP_STYLE}
        initialViewState={initialView}
        // Low enough that the whole country fits the narrow layout's shortest map band (160 px at 200 percent zoom).
        minZoom={2.5}
        maxZoom={13}
        renderWorldCopies={false}
        dragRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onMoveStart={() => setMoving(true)}
        onMoveEnd={() => setMoving(false)}
        // When the style itself cannot be fetched, fall back to plain land so the marks still draw. A failed
        // tile, glyph or sprite only degrades the basemap and is left alone.
        onError={(event) => {
          const failed = (event.error as { url?: string } | undefined)?.url;
          if (!loaded.current && failed && sameUrl(failed, BASEMAP_STYLE)) setBasemapFailed(true);
        }}
        onLoad={(event) => {
          loaded.current = true;
          calmBasemap(event.target);
          // The canvas is the one stop on the map: name it, and point to the list as the keyboard route.
          event.target.getCanvas().setAttribute("aria-label", `${label}. ${LAYOUT.mapKeyboard}`);
          setReady(true);
        }}
      >
        <Overlay
          layers={layers}
          pickingRadius={4}
          onHover={onHover}
          onClick={onClick}
          onAfterRender={afterRender}
        />
        <RankLabels
          schools={
            paint.moves || paint.hidden.includes("numerals") || paint.hidden.includes("ranked") ? [] : schools
          }
          stale={stale}
        />
        <NavigationControl position="top-left" showCompass={false} />
      </MapView>
      {basemapFailed ? (
        <p className={styles.notice} role="status" data-testid="basemap-notice">
          {LAYOUT.basemapUnavailable}
        </p>
      ) : null}
      {hovered && tipAt && !moving ? (
        <MapTooltip
          content={tipFor(hovered.key)}
          at={tipAt}
          width={tipAt.width}
          selected={hovered.key === selectedKey}
        />
      ) : null}
      <Attribution text={attribution} />
    </div>
  );
}

/** The basemap's credit, as its licence requires it: each holder's name links to its terms. */
function Attribution({ text }: { text: string }) {
  const [osm, carto] = text.split(", ");
  return (
    <p className={styles.attribution} data-testid="attribution">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {osm}
      </a>
      {carto ? (
        <>
          ,{" "}
          <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
            {carto}
          </a>
        </>
      ) : null}
    </p>
  );
}
