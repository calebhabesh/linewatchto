import type { MapId } from "./map-manifests.ts";

/** Raster planes are generated per map (scripts/generate-map-rasters.mjs) and named by its id. */
const RASTER_MAP_IDS = ["ttc", "regional"] as const satisfies readonly MapId[];
export type RasterMapId = MapId;

export const RASTER_MAP_THEMES = ["light", "dark", "high-contrast"] as const;
export type RasterMapTheme = "light" | "dark" | "high-contrast";

export const RASTER_MAP_DENSITIES = ["mobile", "balanced", "desktop"] as const;
export type RasterMapDensity = "mobile" | "balanced" | "desktop";

const TTC_RASTER_MAP_PLANES = ["background", "foreground", "labels", "badges"] as const;
export type TtcRasterMapPlane = "background" | "foreground" | "labels" | "badges";

const REGIONAL_RASTER_MAP_PLANES = ["background", "foreground", "labels"] as const;
export type RegionalRasterMapPlane = "background" | "foreground" | "labels";

export type RasterMapPlane = TtcRasterMapPlane;

export const RASTER_MAP_PLANES_BY_MAP = {
  ttc: TTC_RASTER_MAP_PLANES,
  regional: REGIONAL_RASTER_MAP_PLANES,
} as const;

type RasterMapPlaneFor<N extends RasterMapId> =
  N extends "ttc" ? TtcRasterMapPlane : RegionalRasterMapPlane;

export const RASTER_MAP_WIDTHS = {
  ttc: { mobile: 3000, balanced: 4500, desktop: 6750 },
  regional: { mobile: 3200, balanced: 4739, desktop: 7109 },
} as const;

export const RASTER_MAP_RENDERED_SIZES = {
  ttc: { width: 4500, height: 2181.8 },
  regional: { width: 4739.2821, height: 2616.8174 },
  regionalLabels: { width: 17036.959, height: 9031.6719 },
} as const;

interface RasterMapVariantDescriptor {
  map: RasterMapId;
  plane: RasterMapPlane;
  theme: RasterMapTheme;
  density: RasterMapDensity;
  filename: string;
}

export function listAllRasterMapVariants(): RasterMapVariantDescriptor[] {
  const variants: RasterMapVariantDescriptor[] = [];
  for (const map of RASTER_MAP_IDS) {
    for (const plane of RASTER_MAP_PLANES_BY_MAP[map]) {
      for (const theme of RASTER_MAP_THEMES) {
        for (const density of RASTER_MAP_DENSITIES) {
          variants.push({
            map,
            plane,
            theme,
            density,
            filename: `${map}-${plane}-${theme}-${density}.png`,
          });
        }
      }
    }
  }
  return variants;
}

export function isRasterMapPlaneForMap<N extends RasterMapId>(
  map: N,
  plane: string,
): plane is RasterMapPlaneFor<N> {
  const planes = RASTER_MAP_PLANES_BY_MAP[map] as readonly string[];
  return planes.includes(plane);
}
