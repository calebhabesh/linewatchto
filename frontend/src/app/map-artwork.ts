/*
 * Loads each System Map's authored SVG once, prepared as artwork only (the
 * map's `prepareArtwork`): it never takes the pointer and holds no overlays.
 * Concurrent loads of one URL share a request; a failure clears it so the
 * next load retries; a success is cached for instant reuse.
 */
import { lineWatchBuildLabel } from "./app-build.ts";

export type MapArtworkSource = {
  /** The served SVG. */
  url: string;
  /** Turns the fetched SVG into the markup the map mounts. */
  prepare: (svg: string) => string;
};

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
