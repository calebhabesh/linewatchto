export const RASTER_MAP_NETWORKS = ["ttc", "regional"] as const;
export type RasterMapNetwork = "ttc" | "regional";

export const RASTER_MAP_THEMES = ["light", "dark", "high-contrast"] as const;
export type RasterMapTheme = "light" | "dark" | "high-contrast";

export const RASTER_MAP_DENSITIES = ["mobile", "balanced", "desktop"] as const;
export type RasterMapDensity = "mobile" | "balanced" | "desktop";

export const TTC_RASTER_MAP_PLANES = ["background", "foreground", "labels", "badges"] as const;
export type TtcRasterMapPlane = "background" | "foreground" | "labels" | "badges";

export const REGIONAL_RASTER_MAP_PLANES = ["background", "foreground", "labels"] as const;
export type RegionalRasterMapPlane = "background" | "foreground" | "labels";

export type RasterMapPlane = TtcRasterMapPlane;

export const RASTER_MAP_PLANES_BY_NETWORK = {
  ttc: TTC_RASTER_MAP_PLANES,
  regional: REGIONAL_RASTER_MAP_PLANES,
} as const;

export type RasterMapPlaneFor<N extends RasterMapNetwork> =
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

export const RASTER_MAP_REQUIRED_FONTS = [
  {
    family: "TeX Gyre Heros",
    style: "normal",
    weight: "normal",
    file: "/assets/fonts/texgyreheros-regular.woff2",
  },
  {
    family: "TeX Gyre Heros",
    style: "normal",
    weight: "bold",
    file: "/assets/fonts/texgyreheros-bold.woff2",
  },
] as const;

export const RASTER_MAP_SVG_SOURCES = {
  ttc: "frontend/public/assets/linewatch/ttc-subway-map-custom.svg",
  regional: "frontend/public/assets/linewatch/regional-rail-map.svg",
} as const;

export interface RasterMapVariantDescriptor {
  network: RasterMapNetwork;
  plane: RasterMapPlane;
  theme: RasterMapTheme;
  density: RasterMapDensity;
  filename: string;
}

export function listAllRasterMapVariants(): RasterMapVariantDescriptor[] {
  const variants: RasterMapVariantDescriptor[] = [];
  for (const network of RASTER_MAP_NETWORKS) {
    for (const plane of RASTER_MAP_PLANES_BY_NETWORK[network]) {
      for (const theme of RASTER_MAP_THEMES) {
        for (const density of RASTER_MAP_DENSITIES) {
          variants.push({
            network,
            plane,
            theme,
            density,
            filename: `${network}-${plane}-${theme}-${density}.png`,
          });
        }
      }
    }
  }
  return variants;
}

export function isRasterMapPlaneForNetwork<N extends RasterMapNetwork>(
  network: N,
  plane: string,
): plane is RasterMapPlaneFor<N> {
  const planes = RASTER_MAP_PLANES_BY_NETWORK[network] as readonly string[];
  return planes.includes(plane);
}
