import { lineWatchBuildLabel } from "./app-build";
import {
  type RasterMapDensity,
  type RasterMapNetwork,
  type RasterMapPlane,
  type RasterMapTheme,
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
  isRasterMapPlaneForNetwork,
} from "./map-raster-manifest";

export type { RasterMapDensity, RasterMapTheme };

export {
  RASTER_MAP_DENSITIES,
  RASTER_MAP_NETWORKS,
  RASTER_MAP_PLANES_BY_NETWORK,
  RASTER_MAP_RENDERED_SIZES,
  RASTER_MAP_REQUIRED_FONTS,
  RASTER_MAP_SVG_SOURCES,
  RASTER_MAP_THEMES,
  RASTER_MAP_WIDTHS,
  REGIONAL_RASTER_MAP_PLANES,
  TTC_RASTER_MAP_PLANES,
  isRasterMapPlaneForNetwork,
  listAllRasterMapVariants,
  type RasterMapNetwork,
  type RasterMapPlane,
  type RasterMapPlaneFor,
  type RasterMapVariantDescriptor,
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
} from "./map-raster-manifest";

export function rasterMapSource(
  network: "ttc",
  plane: TtcRasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  network: "regional",
  plane: RegionalRasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  network: RasterMapNetwork,
  plane: RasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  network: RasterMapNetwork,
  plane: string,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string {
  if (process.env.NODE_ENV !== "production" && !isRasterMapPlaneForNetwork(network, plane)) {
    console.warn(`Attempted to resolve non-existent raster map plane "${plane}" for network "${network}".`);
  }
  const asset = `/assets/linewatch/raster-maps/${network}-${plane}-${theme}-${density}.png`;
  return `${asset}?v=${encodeURIComponent(lineWatchBuildLabel)}`;
}
