import { lineWatchBuildLabel } from "./app-build";
import {
  type RasterMapDensity,
  type RasterMapId,
  type RasterMapPlane,
  type RasterMapTheme,
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
  isRasterMapPlaneForMap,
} from "./map-raster-manifest";

export type { RasterMapDensity, RasterMapTheme };

export {
  type RegionalRasterMapPlane,
  type TtcRasterMapPlane,
} from "./map-raster-manifest";

export function rasterMapSource(
  map: "ttc",
  plane: TtcRasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  map: "regional",
  plane: RegionalRasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  map: RasterMapId,
  plane: RasterMapPlane,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string;
export function rasterMapSource(
  map: RasterMapId,
  plane: string,
  theme: RasterMapTheme,
  density: RasterMapDensity,
): string {
  if (process.env.NODE_ENV !== "production" && !isRasterMapPlaneForMap(map, plane)) {
    console.warn(`Attempted to resolve non-existent raster map plane "${plane}" for map "${map}".`);
  }
  const asset = `/assets/linewatch/raster-maps/${map}-${plane}-${theme}-${density}.png`;
  return `${asset}?v=${encodeURIComponent(lineWatchBuildLabel)}`;
}
