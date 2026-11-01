/*
 * The GO/UP authored SVG, prepared as artwork from its manifest as every map's
 * is (`prepareMapArtworkMarkup`, app/map-artwork.ts). Its names sit in a
 * transformed layer and link to stations by name, so the manifest asks for
 * glyph copies (`stationLabels.cutout: copy`, `stationLabelLink: name`).
 */
import { cachedMapArtwork, clearMapArtworkCache, mapArtworkCache, mapArtworkSource, preloadMapArtwork, type MapArtworkSource } from "./map-artwork.ts";
import { MAP_MANIFESTS } from "./map-manifests.ts";

/** The GO/UP map's artwork, for its definition and the map registry's preload. */
export const REGIONAL_MAP_ARTWORK: MapArtworkSource = mapArtworkSource(MAP_MANIFESTS.regional);

export const DEFAULT_REGIONAL_MAP_SOURCE = REGIONAL_MAP_ARTWORK.url;

/** The prepared GO/UP artwork's cache, shared by every map (map-artwork.ts). */
export const regionalMapMarkupCache = mapArtworkCache;

export function getRegionalMapMarkup(source: string = DEFAULT_REGIONAL_MAP_SOURCE): string {
  return cachedMapArtwork(source) ?? "";
}

export const clearRegionalMapMarkupCache = clearMapArtworkCache;

/** Loads and prepares the GO/UP SVG once (map-artwork.ts). */
export function preloadRegionalMapMarkup(
  source: string = DEFAULT_REGIONAL_MAP_SOURCE,
): Promise<string> {
  return preloadMapArtwork({ url: source, prepare: REGIONAL_MAP_ARTWORK.prepare });
}
