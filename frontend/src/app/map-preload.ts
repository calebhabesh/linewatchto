/*
 * TTC's authored SVG, prepared as artwork from its manifest as every map's is
 * (`prepareMapArtworkMarkup`, app/map-artwork.ts): the map mounts it whole
 * under its overlay plane, where it paints until the raster planes are ready
 * and then stays as the source of the hovered station name's cutout
 * (`#station-label-…`).
 */
import { mapArtworkSource, type MapArtworkSource } from "./map-artwork.ts";
import { MAP_MANIFESTS } from "./map-manifests.ts";

/** The TTC map's artwork, for its definition. */
export const TTC_MAP_ARTWORK: MapArtworkSource = mapArtworkSource(MAP_MANIFESTS.ttc);

export const DEFAULT_TTC_MAP_SOURCE = TTC_MAP_ARTWORK.url;
