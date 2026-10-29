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
