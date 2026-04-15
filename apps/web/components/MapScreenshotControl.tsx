"use client";

import { Control, DomEvent, DomUtil } from "leaflet";
import * as LeafletNS from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

type LeafletImageFn = (
  map: unknown,
  callback: (error: unknown, canvas: HTMLCanvasElement) => void
) => void;

let leafletImageLoader: Promise<LeafletImageFn> | null = null;

declare global {
  interface Window {
    L?: typeof LeafletNS;
    leafletImage?: LeafletImageFn;
  }
}

function makePngFilename(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.png`;
}

async function loadLeafletImage(): Promise<LeafletImageFn> {
  if (typeof window === "undefined") {
    throw new Error("Map screenshot export is only available in browser.");
  }
  if (typeof window.leafletImage === "function") {
    return window.leafletImage;
  }
  if (leafletImageLoader) {
    return leafletImageLoader;
  }

  if (!window.L) {
    window.L = LeafletNS;
  }

  leafletImageLoader = new Promise<LeafletImageFn>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet-image@0.0.4/leaflet-image.js";
    script.async = true;
    script.onload = () => {
      if (typeof window.leafletImage === "function") {
        resolve(window.leafletImage);
      } else {
        reject(new Error("leaflet-image loaded but did not expose window.leafletImage."));
      }
    };
    script.onerror = () => reject(new Error("Failed to load leaflet-image script."));
    document.head.appendChild(script);
  });

  return leafletImageLoader;
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function elementPaneZIndex(element: Element): number {
  const pane = element.closest(".leaflet-pane") as HTMLElement | null;
  if (!pane) return 0;
  const zIndex = Number(window.getComputedStyle(pane).zIndex);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function drawElementToCanvas(params: {
  ctx: CanvasRenderingContext2D;
  mapRect: DOMRect;
  source: CanvasImageSource;
  elementRect: DOMRect;
}) {
  const { ctx, mapRect, source, elementRect } = params;
  const x = elementRect.left - mapRect.left;
  const y = elementRect.top - mapRect.top;
  if (elementRect.width <= 0 || elementRect.height <= 0) return;
  ctx.drawImage(source, x, y, elementRect.width, elementRect.height);
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return;
  try {
    if (typeof image.decode === "function") {
      await image.decode();
      return;
    }
  } catch {
    // Fall back to onload in case decode fails.
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image failed to load for map screenshot."));
  });
}

async function imageFromSvg(svgEl: SVGElement): Promise<HTMLImageElement> {
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = svgEl.getBoundingClientRect();
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  const markup = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.src = url;
    await decodeImage(img);
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderLeafletViewport(mapContainer: HTMLElement): Promise<HTMLCanvasElement> {
  const mapRect = mapContainer.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(mapRect.width * dpr));
  canvas.height = Math.max(1, Math.round(mapRect.height * dpr));
  canvas.style.width = `${mapRect.width}px`;
  canvas.style.height = `${mapRect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create 2D context for map screenshot.");
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const imgNodes = Array.from(
    mapContainer.querySelectorAll<HTMLImageElement>(".leaflet-pane img.leaflet-tile, .leaflet-pane img.leaflet-image-layer")
  );
  const canvasNodes = Array.from(mapContainer.querySelectorAll<HTMLCanvasElement>(".leaflet-pane canvas"));
  const svgNodes = Array.from(mapContainer.querySelectorAll<SVGElement>(".leaflet-pane svg"));

  const orderedImgNodes = imgNodes
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .sort((left, right) => elementPaneZIndex(left) - elementPaneZIndex(right));

  for (const node of orderedImgNodes) {
    try {
      await decodeImage(node);
      drawElementToCanvas({
        ctx,
        mapRect,
        source: node,
        elementRect: node.getBoundingClientRect(),
      });
    } catch {
      // Ignore any single tile/layer draw failure.
    }
  }

  const orderedCanvasNodes = canvasNodes
    .filter((node) => node.width > 0 && node.height > 0)
    .sort((left, right) => elementPaneZIndex(left) - elementPaneZIndex(right));

  for (const node of orderedCanvasNodes) {
    try {
      drawElementToCanvas({
        ctx,
        mapRect,
        source: node,
        elementRect: node.getBoundingClientRect(),
      });
    } catch {
      // Ignore any single canvas draw failure.
    }
  }

  const orderedSvgNodes = svgNodes.sort((left, right) => elementPaneZIndex(left) - elementPaneZIndex(right));
  for (const node of orderedSvgNodes) {
    try {
      const image = await imageFromSvg(node);
      drawElementToCanvas({
        ctx,
        mapRect,
        source: image,
        elementRect: node.getBoundingClientRect(),
      });
    } catch {
      // Ignore any single SVG draw failure.
    }
  }

  return canvas;
}

async function renderWithLeafletImage(mapInstance: unknown): Promise<HTMLCanvasElement> {
  const leafletImage = await loadLeafletImage();
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    leafletImage(mapInstance, (error, canvas) => {
      if (error) {
        reject(error instanceof Error ? error : new Error("leaflet-image failed to render map."));
        return;
      }
      resolve(canvas);
    });
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filenamePrefix: string) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = makePngFilename(filenamePrefix);
  link.click();
}

export function MapScreenshotControl({ filenamePrefix }: { filenamePrefix: string }) {
  const map = useMap();

  useEffect(() => {
    let removed = false;
    const screenshotControl = new Control({ position: "topleft" });

    screenshotControl.onAdd = () => {
      const container = DomUtil.create("div", "leaflet-bar map-screenshot-control");
      const button = DomUtil.create("button", "leaflet-bar-part map-screenshot-control-button", container) as HTMLButtonElement;
      button.type = "button";
      button.title = "Save current map window as PNG";
      button.textContent = "PNG";

      const handleClick = async (event: Event) => {
        DomEvent.stop(event);
        if (button.disabled) return;

        map.stop();
        await waitForFrame();
        button.disabled = true;
        const previousLabel = button.textContent;
        button.textContent = "...";

        try {
          if (removed) return;
          let canvas: HTMLCanvasElement;
          try {
            canvas = await renderWithLeafletImage(map);
          } catch {
            canvas = await renderLeafletViewport(map.getContainer());
          }
          downloadCanvas(canvas, filenamePrefix);
        } catch (error) {
          // Keep failure handling local to avoid breaking map interaction.
          console.error(error);
        } finally {
          button.disabled = false;
          button.textContent = previousLabel;
        }
      };

      DomEvent.on(button, "click", handleClick);
      return container;
    };

    screenshotControl.addTo(map);
    return () => {
      removed = true;
      screenshotControl.remove();
    };
  }, [filenamePrefix, map]);

  return null;
}
