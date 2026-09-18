import { lineWatchBuildLabel } from "./app-build";

export type TtcMapMarkupParts = {
  part1: string;
  part2: string;
};

export function parseTtcMapMarkup(text: string): TtcMapMarkupParts {
  const documentNode = new DOMParser().parseFromString(text, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("Invalid TTC map SVG");
  }

  const svg = documentNode.documentElement;
  const mapRoot = svg.querySelector<SVGGElement>("#ttc-map-root");
  if (!mapRoot) throw new Error("Missing TTC map root");

  const requiredLayerIds = [
    "ttc-tracks-layer",
    "non-linear-guides-layer",
    "ttc-station-labels-layer",
    "ttc-stations-layer",
    "ttc-line-badges-layer",
    "ttc-connection-labels-layer",
  ] as const;
  const layers = new Map(requiredLayerIds.map((id) => {
    const layer = mapRoot.querySelector<SVGGElement>(`:scope > #${id}`);
    if (!layer) throw new Error(`Missing TTC map layer ${id}`);
    return [id, layer] as const;
  }));
  const stationLabelsLayer = layers.get("ttc-station-labels-layer")!;
  for (const label of stationLabelsLayer.querySelectorAll<SVGGraphicsElement>("[data-station-label-for]")) {
    const stationId = label.dataset.stationLabelFor;
    if (!stationId) continue;

    const hoverEffect = documentNode.createElementNS("http://www.w3.org/2000/svg", "g");
    hoverEffect.classList.add("station-label-hover-effect");
    label.before(hoverEffect);
    hoverEffect.append(label);
  }
  const serializer = new XMLSerializer();
  const sharedMarkup = Array.from(svg.children)
    .filter((element) => element.localName === "defs" || element.localName === "style")
    .map((element) => serializer.serializeToString(element))
    .join("");

  const serializeLayers = (id: string, layerIds: readonly (typeof requiredLayerIds)[number][]) => {
    const wrapper = documentNode.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.setAttribute("id", id);
    for (const layerId of layerIds) {
      wrapper.append(layers.get(layerId)!.cloneNode(true));
    }
    return serializer.serializeToString(wrapper);
  };

  return {
    part1: sharedMarkup + serializeLayers("ttc-map-base-root", [
      "ttc-tracks-layer",
      "non-linear-guides-layer",
    ]),
    part2: serializeLayers("ttc-map-foreground-root", [
      "ttc-station-labels-layer",
      "ttc-stations-layer",
      "ttc-line-badges-layer",
      "ttc-connection-labels-layer",
    ]),
  };
}

export const ttcMapMarkupCache = new Map<string, TtcMapMarkupParts>();
const ttcMapMarkupPromises = new Map<string, Promise<TtcMapMarkupParts>>();

export function preloadTtcMapMarkup(source: string): Promise<TtcMapMarkupParts> {
  const cached = ttcMapMarkupCache.get(source);
  if (cached) return Promise.resolve(cached);

  const existing = ttcMapMarkupPromises.get(source);
  if (existing) return existing;

  const separator = source.includes("?") ? "&" : "?";
  const load = fetch(`${source}${separator}v=${lineWatchBuildLabel}`)
    .then((response) => {
      if (!response.ok) throw new Error("Map load failed");
      return response.text();
    })
    .then((text) => {
      const parts = parseTtcMapMarkup(text);
      ttcMapMarkupCache.set(source, parts);
      return parts;
    })
    .finally(() => {
      ttcMapMarkupPromises.delete(source);
    });

  ttcMapMarkupPromises.set(source, load);
  return load;
}

const REGIONAL_LARGE_TERMINAL_IDS = new Set([
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

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
const REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer";
const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
const REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer";

function removeDescendantIds(element: SVGElement) {
  element.removeAttribute("id");
  element.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
}

function normalizedRegionalStationLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export let regionalMapMarkupCache = "";
export function setRegionalMapMarkupCache(markup: string) {
  regionalMapMarkupCache = markup;
}

let regionalMapMarkupPromise: Promise<string> | null = null;

export function preloadRegionalMapMarkup(): Promise<string> {
  if (regionalMapMarkupCache) return Promise.resolve(regionalMapMarkupCache);
  if (regionalMapMarkupPromise) return regionalMapMarkupPromise;
  const load = fetch(`/assets/linewatch/regional-rail-map.svg?v=${lineWatchBuildLabel}`)
    .then((response) => {
      if (!response.ok) throw new Error("Regional map unavailable");
      return response.text();
    })
    .then((source) => {
      const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
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
        const hitShapes = hitTarget.matches("circle, rect, ellipse") ? [hitTarget] : [...hitTarget.querySelectorAll<SVGElement>("circle, rect, ellipse")];
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
        const hoverShapes = hoverIndicator.matches("circle, rect, ellipse") ? [hoverIndicator] : [...hoverIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
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
        const selectedShapes = selectedIndicator.matches("circle, rect, ellipse") ? [selectedIndicator] : [...selectedIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
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

        const cutoutSource = documentNode.createElementNS(SVG_NAMESPACE, "g");
        cutoutSource.id = `regional-station-label-cutout-source-${stationId}`;
        cutoutSource.classList.add("regional-station-label-cutout-source");
        if (labelLayerTransform) cutoutSource.setAttribute("transform", labelLayerTransform);
        const cutoutLabel = label.cloneNode(true) as SVGTextElement;
        removeDescendantIds(cutoutLabel);
        cutoutLabel.removeAttribute("data-regional-station-label-for");
        cutoutSource.append(cutoutLabel);
        labelCutoutSources.append(cutoutSource);

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
      const selectedSegmentLayer = createLayer(REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID, "regional-selected-segment-layer");
      const stationRingLayer = createLayer(REGIONAL_DYNAMIC_STATION_RING_LAYER_ID);
      const hoverLayer = createLayer(REGIONAL_DYNAMIC_HOVER_LAYER_ID, "regional-impact-hover-foreground-layer");
      hoverLayer.setAttribute("aria-hidden", "true");
      hoverLayer.setAttribute("pointer-events", "none");
      stationsLayer.insertBefore(segmentLayer, firstStationTarget);
      stationsLayer.insertBefore(commuteLayer, firstStationTarget);
      stationsLayer.insertBefore(selectedSegmentLayer, firstStationTarget);
      stationsLayer.insertBefore(stationRingLayer, firstStationTarget);
      stationsLayer.insertBefore(hoverLayer, firstStationTarget);

      const effectsLayer = createLayer(REGIONAL_DYNAMIC_EFFECTS_LAYER_ID, "regional-station-impact-effects-layer");
      effectsLayer.setAttribute("aria-label", "Station alert beacons and directions");
      effectsLayer.setAttribute("pointer-events", "none");
      effectsLayer.style.setProperty("--map-pulse-offset", "0s");
      stationsLayer.append(effectsLayer);
      const root = documentNode.documentElement;
      root.removeAttribute("width");
      root.removeAttribute("height");
      root.setAttribute("preserveAspectRatio", "xMidYMid meet");
      root.setAttribute("aria-label", "GO and UP regional rail schematic");
      root.setAttribute("role", "img");
      return new XMLSerializer().serializeToString(root);
    });
  regionalMapMarkupPromise = load.then((markup) => {
    regionalMapMarkupCache = markup;
    return markup;
  }).catch((error) => {
    regionalMapMarkupPromise = null;
    throw error;
  });
  return regionalMapMarkupPromise;
}
