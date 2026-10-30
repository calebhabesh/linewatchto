import { lineWatchBuildLabel } from "./app-build.ts";

export const DEFAULT_REGIONAL_MAP_SOURCE = "/assets/linewatch/regional-rail-map.svg";

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
 * map's own planes (InteractiveRegionalMap.tsx).
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

export const regionalMapMarkupCache = new Map<string, string>();
const regionalMapMarkupPromises = new Map<string, Promise<string>>();

export function getRegionalMapMarkup(source: string = DEFAULT_REGIONAL_MAP_SOURCE): string {
  return regionalMapMarkupCache.get(source) ?? "";
}

export function clearRegionalMapMarkupCache(): void {
  regionalMapMarkupCache.clear();
  regionalMapMarkupPromises.clear();
}

/**
 * Preloads and parses the regional map SVG asset.
 *
 * Concurrent calls for the same asset URL share an in-flight promise and parse once.
 * Successful parsing populates the memory cache for subsequent instant access.
 * Failed requests or parsing errors clear the in-flight promise, allowing immediate retry.
 */
export function preloadRegionalMapMarkup(
  source: string = DEFAULT_REGIONAL_MAP_SOURCE,
): Promise<string> {
  if (typeof window === "undefined") {
    return Promise.resolve("");
  }

  const cached = regionalMapMarkupCache.get(source);
  if (cached) return Promise.resolve(cached);

  const existing = regionalMapMarkupPromises.get(source);
  if (existing) return existing;

  const separator = source.includes("?") ? "&" : "?";
  const url = `${source}${separator}v=${encodeURIComponent(lineWatchBuildLabel)}`;

  const load = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error("Regional map unavailable");
      return response.text();
    })
    .then((text) => {
      const markup = prepareRegionalMapMarkup(text);
      regionalMapMarkupCache.set(source, markup);
      return markup;
    })
    .finally(() => {
      regionalMapMarkupPromises.delete(source);
    });

  regionalMapMarkupPromises.set(source, load);
  return load;
}
