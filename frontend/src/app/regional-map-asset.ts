import { cachedMapArtwork, clearMapArtworkCache, mapArtworkCache, preloadMapArtwork, type MapArtworkSource } from "./map-artwork.ts";
import { MAP_MANIFESTS, mapArtworkUrl } from "./map-manifests.ts";

export const DEFAULT_REGIONAL_MAP_SOURCE = mapArtworkUrl(MAP_MANIFESTS.regional);

export const REGIONAL_LARGE_TERMINAL_IDS = new Set([
  "union",
  "allandale-waterfront",
  "niagara-falls",
  "durham-college-oshawa",
  "stratford",
  "kitchener",
  "milton",
  "bloomington",
  "old-elm",
  "pearson-airport",
  "hamilton",
  "west-harbour",
  "exhibition",
  "kipling",
  "kennedy",
  "bloor",
  "weston",
  "mount-dennis",
]);

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function removeDescendantIds(element: SVGElement): void {
  element.removeAttribute("id");
  element.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
}

export function normalizedRegionalStationLabel(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Prepares the authored regional rail SVG as artwork and a geometry source
 * only, as TTC's is: it never takes the pointer and holds no overlays. Station
 * names are tagged with their station and given glyph-shaped cutout sources
 * for the hover label; connection labels are tagged for badge placement.
 * Overlays, station targets and selection markers are React elements in the
 * map's own planes (components/SystemMap.tsx).
 */
export function prepareRegionalMapMarkup(source: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this environment");
  }

  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("Invalid regional map SVG");
  }

  const regionalStationIds = new Map<string, string>();
  for (const element of documentNode.querySelectorAll<SVGElement>("[id^='station-']")) {
    if (element.id.endsWith("-ki") || element.id.endsWith("-up")) continue;
    const stationId = element.id.replace(/^station-/, "");
    regionalStationIds.set(normalizedRegionalStationLabel(stationId), stationId);
  }

  const stationLabelsLayer = documentNode.getElementById("regional-station-labels-layer");
  const labelCutoutSources = documentNode.createElementNS(SVG_NAMESPACE, "defs");
  labelCutoutSources.id = "regional-station-label-cutout-sources";
  documentNode.documentElement.prepend(labelCutoutSources);
  const labelLayerTransform = stationLabelsLayer?.parentElement?.getAttribute("transform");

  for (const label of stationLabelsLayer?.querySelectorAll<SVGTextElement>(":scope > text") ?? []) {
    const stationId = regionalStationIds.get(normalizedRegionalStationLabel(label.textContent ?? ""));
    if (!stationId) continue;

    label.dataset.regionalStationLabelFor = stationId;
    label.id = `regional-station-label-${stationId}`;

    // Reuse the authored glyph geometry for both the resting-plane cutout
    // and the hover isolation mask. Hover pixels still come from the
    // raster texture, while the font-readiness gate and small mask
    // dilation keep browser metrics from slicing their edges. The
    // glyph-shaped mask also rejects nearby labels when bounds overlap.
    const cutoutSource = documentNode.createElementNS(SVG_NAMESPACE, "g");
    cutoutSource.id = `regional-station-label-cutout-source-${stationId}`;
    cutoutSource.classList.add("regional-station-label-cutout-source");
    if (labelLayerTransform) cutoutSource.setAttribute("transform", labelLayerTransform);
    const cutoutLabel = label.cloneNode(true) as SVGTextElement;
    removeDescendantIds(cutoutLabel);
    cutoutLabel.removeAttribute("data-regional-station-label-for");
    cutoutSource.append(cutoutLabel);
    labelCutoutSources.append(cutoutSource);
  }

  for (const element of documentNode.querySelectorAll<SVGElement>("[style]")) {
    element.style.removeProperty("shape-rendering");
    element.style.removeProperty("text-rendering");
    element.style.removeProperty("image-rendering");
  }

  for (const element of documentNode.querySelectorAll<SVGElement>("g")) {
    const authoredLabel = element.getAttributeNS(
      "http://www.inkscape.org/namespaces/inkscape",
      "label",
    ) ?? element.getAttribute("inkscape:label") ?? "";
    if (authoredLabel.startsWith("via-rail-") || authoredLabel.endsWith("airport-icon")) {
      element.classList.add("map-connection-label");
    }
    if (authoredLabel.endsWith("airport-icon")) {
      element.classList.add("map-connection-airport");
    }
  }

  if (!documentNode.getElementById("regional-stations-layer")) {
    throw new Error("Regional station layer unavailable");
  }

  const root = documentNode.documentElement;
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("aria-hidden", "true");

  return new XMLSerializer().serializeToString(root);
}

/** The prepared GO/UP artwork's cache, shared by every map (map-artwork.ts). */
export const regionalMapMarkupCache = mapArtworkCache;

export function getRegionalMapMarkup(source: string = DEFAULT_REGIONAL_MAP_SOURCE): string {
  return cachedMapArtwork(source) ?? "";
}

export const clearRegionalMapMarkupCache = clearMapArtworkCache;

/** The GO/UP map's artwork, for its definition and the map registry's preload. */
export const REGIONAL_MAP_ARTWORK: MapArtworkSource = { url: DEFAULT_REGIONAL_MAP_SOURCE, prepare: prepareRegionalMapMarkup };

/** Loads and prepares the GO/UP SVG once (map-artwork.ts). */
export function preloadRegionalMapMarkup(
  source: string = DEFAULT_REGIONAL_MAP_SOURCE,
): Promise<string> {
  return preloadMapArtwork({ url: source, prepare: prepareRegionalMapMarkup });
}
