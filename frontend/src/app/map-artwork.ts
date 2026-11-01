/*
 * Loads each System Map's authored SVG once, prepared as artwork only from
 * its manifest (`prepareMapArtworkMarkup`).
 * Concurrent loads of one URL share a request; a failure clears it so the
 * next load retries; a success is cached for instant reuse.
 */
import { lineWatchBuildLabel } from "./app-build.ts";
import { mapArtworkUrl, type MapManifest } from "./map-manifests.ts";

export type MapArtworkSource = {
  /** The served SVG. */
  url: string;
  /** Turns the fetched SVG into the markup the map mounts. */
  prepare: (svg: string) => string;
};

/** The manifest facts the artwork preparation reads. */
export type MapArtworkManifest = Pick<
  MapManifest<string>,
  "id" | "svg" | "layers" | "stationLabelLink" | "stationLabels" | "stationPartSuffixes"
>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Rendering hints an authored SVG sets inline that the map's own CSS decides
 * (phones' performance mode lowers shape quality). Text keeps its authored
 * hints: names must render as their prepared boxes and raster textures do.
 */
const RENDERING_HINTS = ["shape-rendering", "image-rendering"] as const;

/** Removes the ids inside a copy of artwork, so it never duplicates the original's. */
export function removeDescendantIds(element: Element): void {
  element.removeAttribute("id");
  element.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
}

/** A station name or id reduced to letters and digits, for `stationLabelLink: name`. */
export function normalizedStationName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Each name in the labels layer with the station it names (`stationLabelLink`). */
function linkedStationLabels(documentNode: Document, manifest: MapArtworkManifest, labelsLayer: Element) {
  const labels = [...labelsLayer.querySelectorAll<SVGTextElement>(":scope > text")];
  const link = manifest.stationLabelLink;
  if (link.kind === "attribute") {
    return labels.flatMap((label) => {
      const stationId = label.getAttribute(link.attribute);
      return stationId ? [{ label, stationId }] : [];
    });
  }
  const stationIds = new Map<string, string>();
  for (const element of documentNode.querySelectorAll(`${manifest.layers.stations} [id^='station-']`)) {
    if (manifest.stationPartSuffixes.some((suffix) => element.id.endsWith(suffix))) continue;
    const stationId = element.id.replace(/^station-/, "");
    stationIds.set(normalizedStationName(stationId), stationId);
  }
  return labels.flatMap((label) => {
    const stationId = stationIds.get(normalizedStationName(label.textContent ?? ""));
    return stationId ? [{ label, stationId }] : [];
  });
}

/** The transforms from the root to an element's parent, outermost first. */
function ancestorTransform(element: Element): string {
  const transforms: string[] = [];
  for (let parent = element.parentElement; parent && parent !== element.ownerDocument.documentElement; parent = parent.parentElement) {
    const transform = parent.getAttribute("transform");
    if (transform) transforms.unshift(transform);
  }
  return transforms.join(" ");
}

/**
 * Prepares a map's authored SVG as artwork only, from its manifest: it never
 * takes the pointer and holds no overlays. Every map gets the same steps:
 * - its manifest layers must exist;
 * - inline shape and image rendering hints are dropped, so the map's CSS
 *   decides them (phones' performance mode lowers them); text keeps its own;
 * - with a `copy` name cutout (`stationLabels.cutout`), each linked name
 *   (`stationLabelLink`) gets a glyph copy without ids, at its root
 *   transform, under `<defs id="<map id>-station-label-cutout-sources">`; a
 *   `use` cutout references the authored label and needs none;
 * - the root fills its plane (no size of its own, `xMidYMid meet`) and is
 *   hidden from assistive technology.
 */
export function prepareMapArtworkMarkup(text: string, manifest: MapArtworkManifest): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this environment");
  }
  const documentNode = new DOMParser().parseFromString(text, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) throw new Error(`Invalid map SVG for ${manifest.id}`);
  const { stations, stationLabels, lines } = manifest.layers;
  for (const selector of [stations, stationLabels, lines]) {
    if (!documentNode.querySelector(selector)) throw new Error(`Map ${manifest.id} is missing layer ${selector}`);
  }

  for (const element of documentNode.querySelectorAll<SVGElement>("[style]")) {
    for (const hint of RENDERING_HINTS) element.style.removeProperty(hint);
  }

  const { cutout } = manifest.stationLabels;
  if (cutout.kind === "copy") {
    const labelsLayer = documentNode.querySelector(stationLabels)!;
    const sources = documentNode.createElementNS(SVG_NAMESPACE, "defs");
    sources.id = `${manifest.id}-station-label-cutout-sources`;
    documentNode.documentElement.prepend(sources);
    for (const { label, stationId } of linkedStationLabels(documentNode, manifest, labelsLayer)) {
      label.setAttribute("data-map-station-label-for", stationId);
      // The hover cuts the name's glyphs out of the label texture with this
      // copy: `<use>` would drop the transformed layer the name sits in.
      const source = documentNode.createElementNS(SVG_NAMESPACE, "g");
      source.id = `${cutout.idPrefix}${stationId}`;
      source.classList.add("map-station-label-cutout-source");
      const transform = ancestorTransform(label);
      if (transform) source.setAttribute("transform", transform);
      const copy = label.cloneNode(true) as SVGTextElement;
      removeDescendantIds(copy);
      copy.removeAttribute("data-map-station-label-for");
      source.append(copy);
      sources.append(source);
    }
  }

  const root = documentNode.documentElement;
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("aria-hidden", "true");
  return new XMLSerializer().serializeToString(root);
}

/** A map's served SVG and its preparation (`prepareMapArtworkMarkup`). */
export function mapArtworkSource(manifest: MapArtworkManifest): MapArtworkSource {
  return { url: mapArtworkUrl(manifest), prepare: (svg) => prepareMapArtworkMarkup(svg, manifest) };
}

/**
 * Prepared artwork in two parts, as a map's raster planes split it: what
 * paints under the overlays (lines and other art), and the station and name
 * layers (`overLayers`, CSS selectors) that paint over them. For a map with no
 * raster planes. Every id stays in exactly one part: the over part drops its
 * definitions (references resolve to the under part's) and its wrappers' ids.
 */
export function splitMapArtwork(markup: string, overLayers: readonly string[]): { under: string; over: string } {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const selector = overLayers.join(", ");
  const under = parser.parseFromString(markup, "image/svg+xml").documentElement;
  under.querySelectorAll(selector).forEach((layer) => layer.remove());
  const over = parser.parseFromString(markup, "image/svg+xml").documentElement;
  const kept = [...over.querySelectorAll(selector)];
  const prune = (parent: Element) => {
    for (const child of [...parent.children]) {
      if (kept.includes(child)) continue;
      if (kept.some((layer) => child.contains(layer))) {
        child.removeAttribute("id");
        prune(child);
      } else {
        child.remove();
      }
    }
  };
  over.removeAttribute("id");
  prune(over);
  return { under: serializer.serializeToString(under), over: serializer.serializeToString(over) };
}

export const mapArtworkCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string>>();

/** The prepared artwork, if it has loaded. */
export function cachedMapArtwork(url: string): string | null {
  return mapArtworkCache.get(url) ?? null;
}

export function clearMapArtworkCache(): void {
  mapArtworkCache.clear();
  pendingLoads.clear();
}

export function preloadMapArtwork({ url, prepare }: MapArtworkSource): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("");

  const cached = mapArtworkCache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = pendingLoads.get(url);
  if (existing) return existing;

  const separator = url.includes("?") ? "&" : "?";
  const load = fetch(`${url}${separator}v=${encodeURIComponent(lineWatchBuildLabel)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Map artwork unavailable: ${url}`);
      return response.text();
    })
    .then((text) => {
      const markup = prepare(text);
      mapArtworkCache.set(url, markup);
      return markup;
    })
    .finally(() => {
      pendingLoads.delete(url);
    });

  pendingLoads.set(url, load);
  return load;
}
