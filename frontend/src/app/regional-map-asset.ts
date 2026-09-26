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
export const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
export const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
export const REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer";
export const REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID = "regional-dynamic-planned-station-layer";
export const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
export const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
export const REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer";

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
 * Prepares the authored regional rail SVG by appending interactive hit targets,
 * hover indicators, selection artwork, label cutout sources, and dynamic layers.
 *
 * This preparation is immutable after initial parsing; dynamic dashboard updates
 * modify only the purpose-built overlay layers, avoiding full SVG re-rasterization.
 */
export function prepareRegionalMapMarkup(source: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this environment");
  }

  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("Invalid regional map SVG");
  }

  const regionalSvgRoot = documentNode.documentElement as unknown as SVGSVGElement;
  const stationSelectionSources = documentNode.createElementNS(SVG_NAMESPACE, "defs");
  stationSelectionSources.id = "regional-station-selection-sources";
  regionalSvgRoot.prepend(stationSelectionSources);

  for (const element of documentNode.querySelectorAll<SVGElement>("[id^='station-']")) {
    if (element.id.endsWith("-ki") || element.id.endsWith("-up")) continue;
    const stationId = element.id.replace(/^station-/, "");
    const hitTarget = element.cloneNode(true) as SVGElement;
    removeDescendantIds(hitTarget);
    hitTarget.dataset.regionalStationId = stationId;
    hitTarget.setAttribute("role", "button");
    hitTarget.setAttribute("tabindex", "0");
    hitTarget.setAttribute("aria-label", `${stationId.replaceAll("-", " ")} station details`);
    hitTarget.classList.add("regional-station-hit-target");
    const title = documentNode.createElementNS(SVG_NAMESPACE, "title");
    title.textContent = `${stationId.replaceAll("-", " ")} station`;
    hitTarget.prepend(title);
    const hitShapes = hitTarget.matches("circle, rect, ellipse")
      ? [hitTarget]
      : [...hitTarget.querySelectorAll<SVGElement>("circle, rect, ellipse")];
    for (const shape of hitShapes) {
      shape.setAttribute("style", "fill:transparent;stroke:transparent;stroke-width:120;pointer-events:all");
    }

    const isLarge = REGIONAL_LARGE_TERMINAL_IDS.has(stationId);
    const scaleFactor = isLarge ? 1.35 : 1.45;

    const hoverIndicator = element.cloneNode(true) as SVGElement;
    removeDescendantIds(hoverIndicator);
    hoverIndicator.dataset.regionalStationHoverId = stationId;
    hoverIndicator.classList.add("station-hover-indicator", "regional-station-hover-indicator");
    if (isLarge) hoverIndicator.classList.add("large-terminal");
    hoverIndicator.setAttribute("aria-hidden", "true");
    const hoverShapes = hoverIndicator.matches("circle, rect, ellipse")
      ? [hoverIndicator]
      : [...hoverIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
    for (const shape of hoverShapes) {
      if (shape.getAttribute("inkscape:label") === "join-rectangle") {
        shape.remove();
        continue;
      }
      const tagName = shape.tagName.toLowerCase();
      if (tagName === "circle") {
        const r = Number(shape.getAttribute("r") ?? 0);
        shape.setAttribute("r", String(r * scaleFactor));
      } else if (tagName === "ellipse") {
        const rx = Number(shape.getAttribute("rx") ?? 0);
        const ry = Number(shape.getAttribute("ry") ?? 0);
        shape.setAttribute("rx", String(rx * scaleFactor));
        shape.setAttribute("ry", String(ry * scaleFactor));
      } else if (tagName === "rect") {
        const w = Number(shape.getAttribute("width") ?? 0);
        const h = Number(shape.getAttribute("height") ?? 0);
        const x = Number(shape.getAttribute("x") ?? 0);
        const y = Number(shape.getAttribute("y") ?? 0);
        const rx = Number(shape.getAttribute("rx") ?? 0);
        const ry = Number(shape.getAttribute("ry") ?? 0);
        const padding = stationId === "union" ? 75 : (w * (scaleFactor - 1)) / 2;
        shape.setAttribute("width", String(w + padding * 2));
        shape.setAttribute("height", String(h + padding * 2));
        shape.setAttribute("x", String(x - padding));
        shape.setAttribute("y", String(y - padding));
        if (rx) shape.setAttribute("rx", String(rx + padding));
        if (ry) shape.setAttribute("ry", String(ry + padding));
      }
    }

    // Junction groups can carry authored transforms (Bloor is rotated,
    // Mount Dennis is translated). Keep that authored transform on an
    // inert outer wrapper so the animated inner artwork retains the exact
    // local geometry and intro motion used by the original station marker.
    const selectedIndicatorContainer = element.matches("g")
      ? documentNode.createElementNS(SVG_NAMESPACE, "g")
      : null;
    const selectedIndicator = element.cloneNode(true) as SVGElement;
    if (element.matches("g")) {
      const authoredTransform = selectedIndicator.getAttribute("transform");
      selectedIndicator.removeAttribute("transform");
      if (authoredTransform) selectedIndicatorContainer?.setAttribute("transform", authoredTransform);
      selectedIndicatorContainer?.append(selectedIndicator);
    }
    removeDescendantIds(selectedIndicator);
    selectedIndicator.dataset.regionalStationSelectionId = stationId;
    selectedIndicator.classList.add(
      "map-selection-attention",
      "station-selected-indicator",
      "regional-station-selected-indicator",
      "foreground-flash-active",
    );
    selectedIndicator.setAttribute("aria-hidden", "true");
    const selectedShapes = selectedIndicator.matches("circle, rect, ellipse")
      ? [selectedIndicator]
      : [...selectedIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
    for (const shape of selectedShapes) {
      if (shape.getAttribute("inkscape:label") === "join-rectangle") {
        shape.remove();
        continue;
      }
      shape.removeAttribute("style");
      shape.setAttribute("style", "fill:var(--station-selection-accent);stroke:none;");
      const tagName = shape.tagName.toLowerCase();
      const selectedScaleFactor = isLarge ? 1 : 1.2;
      if (tagName === "circle") {
        const radius = Number(shape.getAttribute("r") ?? 0);
        shape.setAttribute("r", String(radius * selectedScaleFactor));
      } else if (tagName === "ellipse") {
        const radiusX = Number(shape.getAttribute("rx") ?? 0);
        const radiusY = Number(shape.getAttribute("ry") ?? 0);
        shape.setAttribute("rx", String(radiusX * selectedScaleFactor));
        shape.setAttribute("ry", String(radiusY * selectedScaleFactor));
      } else if (tagName === "rect") {
        const width = Number(shape.getAttribute("width") ?? 0);
        const height = Number(shape.getAttribute("height") ?? 0);
        const x = Number(shape.getAttribute("x") ?? 0);
        const y = Number(shape.getAttribute("y") ?? 0);
        const paddingX = (width * (selectedScaleFactor - 1)) / 2;
        const paddingY = (height * (selectedScaleFactor - 1)) / 2;
        shape.setAttribute("width", String(width + paddingX * 2));
        shape.setAttribute("height", String(height + paddingY * 2));
        shape.setAttribute("x", String(x - paddingX));
        shape.setAttribute("y", String(y - paddingY));
      }
    }

    // Cross-SVG <use> references omit ancestor transforms. Build a root
    // defs source with the complete authored transform chain so the
    // foreground flash remains on its station, including junctions.
    const selectionSource = documentNode.createElementNS(SVG_NAMESPACE, "g");
    selectionSource.id = `regional-station-selection-source-${stationId}`;
    let transformedSourceParent = selectionSource;
    const transformedAncestors: SVGElement[] = [];
    for (
      let ancestor = element.parentElement as SVGElement | null;
      ancestor && ancestor !== regionalSvgRoot;
      ancestor = ancestor.parentElement as SVGElement | null
    ) {
      if (ancestor.hasAttribute("transform")) transformedAncestors.push(ancestor);
    }
    for (const ancestor of transformedAncestors.reverse()) {
      const transformWrapper = documentNode.createElementNS(SVG_NAMESPACE, "g");
      transformWrapper.setAttribute("transform", ancestor.getAttribute("transform")!);
      transformedSourceParent.append(transformWrapper);
      transformedSourceParent = transformWrapper;
    }
    const selectionArtwork = (selectedIndicatorContainer ?? selectedIndicator).cloneNode(true) as SVGElement;
    const selectionArtworkIndicator = selectionArtwork.matches(".regional-station-selected-indicator")
      ? selectionArtwork
      : selectionArtwork.querySelector<SVGElement>(".regional-station-selected-indicator");
    selectionArtworkIndicator?.classList.remove("map-selection-attention");
    selectionArtworkIndicator?.classList.remove("foreground-flash-active");
    selectionArtworkIndicator?.classList.remove("regional-station-selected-indicator");
    selectionArtworkIndicator?.classList.add("regional-station-selection-source-artwork");
    selectionArtworkIndicator?.setAttribute("data-regional-station-selected", "true");
    selectionArtworkIndicator?.removeAttribute("data-regional-station-selection-id");
    transformedSourceParent.append(selectionArtwork);
    stationSelectionSources.append(selectionSource);

    element.before(hitTarget, hoverIndicator);
    element.after(selectedIndicatorContainer ?? selectedIndicator);
    element.classList.add("regional-station-visual");
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

    // Hide the authored label through an ancestor after the raster plane
    // is ready. Keeping visibility off the referenced text node itself
    // lets SVG <use> resolve its glyph alpha inside the hover masks, as
    // the TTC raster path does.
    const labelSource = documentNode.createElementNS(SVG_NAMESPACE, "g");
    labelSource.classList.add("regional-station-label-source");

    const hitTarget = label.cloneNode(true) as SVGTextElement;
    removeDescendantIds(hitTarget);
    hitTarget.removeAttribute("data-regional-station-label-for");
    hitTarget.dataset.regionalStationId = stationId;
    hitTarget.dataset.regionalStationLabelId = stationId;
    hitTarget.classList.add("regional-station-label-hit-target");
    hitTarget.setAttribute("role", "button");
    hitTarget.setAttribute("tabindex", "0");
    hitTarget.setAttribute("aria-label", `${(label.textContent ?? stationId).trim()} station details`);
    label.before(labelSource);
    labelSource.append(label);
    labelSource.after(hitTarget);
  }

  // The authored map and station interaction geometry are immutable after
  // this preparation pass. Dashboard refreshes update only the purpose-built
  // dynamic layers below, so Chromium never has to discard and reraster the
  // complete regional SVG just because an alert snapshot changed.
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

  const stationsLayer = documentNode.getElementById("regional-stations-layer");
  if (!stationsLayer) throw new Error("Regional station layer unavailable");

  const createLayer = (id: string, className?: string) => {
    const layer = documentNode.createElementNS(SVG_NAMESPACE, "g");
    layer.id = id;
    if (className) layer.classList.add(className);
    return layer;
  };

  const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
  const segmentLayer = createLayer(REGIONAL_DYNAMIC_SEGMENT_LAYER_ID);
  const commuteLayer = createLayer(REGIONAL_DYNAMIC_COMMUTE_LAYER_ID);
  const selectedSegmentLayer = createLayer(
    REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID,
    "regional-selected-segment-layer",
  );
  const stationRingLayer = createLayer(REGIONAL_DYNAMIC_STATION_RING_LAYER_ID);
  const plannedStationLayer = createLayer(REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID);
  const hoverLayer = createLayer(
    REGIONAL_DYNAMIC_HOVER_LAYER_ID,
    "regional-impact-hover-foreground-layer",
  );
  hoverLayer.setAttribute("aria-hidden", "true");
  hoverLayer.setAttribute("pointer-events", "none");

  stationsLayer.insertBefore(segmentLayer, firstStationTarget);
  stationsLayer.insertBefore(commuteLayer, firstStationTarget);
  stationsLayer.insertBefore(selectedSegmentLayer, firstStationTarget);
  stationsLayer.insertBefore(stationRingLayer, firstStationTarget);
  stationsLayer.insertBefore(hoverLayer, firstStationTarget);

  const effectsLayer = createLayer(
    REGIONAL_DYNAMIC_EFFECTS_LAYER_ID,
    "regional-station-impact-effects-layer",
  );
  effectsLayer.setAttribute("aria-label", "Station alert beacons and directions");
  effectsLayer.setAttribute("pointer-events", "none");
  effectsLayer.style.setProperty("--map-pulse-offset", "0s");

  // Match TTC's split planes: the complete repaint stays below authored
  // stations, while the outline-only copy is painted in the top SVG.
  stationsLayer.append(plannedStationLayer, effectsLayer);

  const root = documentNode.documentElement;
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("aria-label", "GO and UP regional rail schematic");
  root.setAttribute("role", "img");

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
