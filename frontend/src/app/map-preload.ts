import { lineWatchBuildLabel } from "./app-build";

export type TtcMapMarkupParts = {
  part1: string;
  part2: string;
  badges: string;
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
      "ttc-connection-labels-layer",
    ]),
    badges: serializeLayers("ttc-map-line-badges-root", [
      "ttc-line-badges-layer",
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

export {
  DEFAULT_REGIONAL_MAP_SOURCE,
  getRegionalMapMarkup,
  preloadRegionalMapMarkup,
  prepareRegionalMapMarkup,
  regionalMapMarkupCache,
} from "./regional-map-asset.ts";
