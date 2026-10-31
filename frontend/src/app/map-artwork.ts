/*
 * Loads each System Map's authored SVG once, prepared as artwork only (the
 * map's `prepareArtwork`): it never takes the pointer and holds no overlays.
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

/**
 * The plain artwork preparation: the authored SVG scaled to its plane (no
 * size of its own, `xMidYMid meet`) and hidden from assistive technology. A
 * map whose SVG needs more (GO/UP links names and cuts glyph copies) brings
 * its own.
 */
export function prepareMapArtworkMarkup(text: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this environment");
  }
  const documentNode = new DOMParser().parseFromString(text, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) throw new Error("Invalid map SVG");
  const root = documentNode.documentElement;
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("aria-hidden", "true");
  return new XMLSerializer().serializeToString(root);
}

/** A map's served SVG with the plain preparation. */
export function mapArtworkSource(manifest: Pick<MapManifest<string>, "svg">): MapArtworkSource {
  return { url: mapArtworkUrl(manifest), prepare: prepareMapArtworkMarkup };
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
