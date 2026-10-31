/*
 * TTC's authored SVG, prepared as artwork only, as GO/UP's is
 * (regional-map-asset.ts): the map mounts it whole under its overlay plane,
 * where it paints until the raster planes are ready and then stays as the
 * source of the hovered station name's cutout (`#station-label-…`).
 */
import { preloadMapArtwork } from "./map-artwork.ts";

export const DEFAULT_TTC_MAP_SOURCE = "/assets/linewatch/ttc-subway-map-custom.svg";

const REQUIRED_TTC_LAYER_IDS = [
  "ttc-tracks-layer",
  "ttc-station-labels-layer",
  "ttc-stations-layer",
  "ttc-line-badges-layer",
  "ttc-connection-labels-layer",
] as const;

export function prepareTtcMapMarkup(text: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this environment");
  }
  const documentNode = new DOMParser().parseFromString(text, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("Invalid TTC map SVG");
  }

  const root = documentNode.documentElement;
  const mapRoot = root.querySelector<SVGGElement>("#ttc-map-root");
  if (!mapRoot) throw new Error("Missing TTC map root");
  for (const id of REQUIRED_TTC_LAYER_IDS) {
    if (!mapRoot.querySelector(`:scope > #${id}`)) throw new Error(`Missing TTC map layer ${id}`);
  }

  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("aria-hidden", "true");
  return new XMLSerializer().serializeToString(root);
}

/** Loads and prepares the TTC SVG once (map-artwork.ts). */
export function preloadTtcMapMarkup(source: string = DEFAULT_TTC_MAP_SOURCE): Promise<string> {
  return preloadMapArtwork({ url: source, prepare: prepareTtcMapMarkup });
}
