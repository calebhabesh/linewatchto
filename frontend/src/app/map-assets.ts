import { lineWatchBuildLabel } from "./app-build";

export type RasterMapTheme = "light" | "dark" | "high-contrast";
export type RasterMapDensity = "mobile" | "balanced" | "desktop";

export function rasterMapSource(
  network: "ttc" | "regional",
  plane: "background" | "foreground" | "labels",
  theme: RasterMapTheme,
  density: RasterMapDensity,
) {
  const asset = `/assets/linewatch/raster-maps/${network}-${plane}-${theme}-${density}.png`;
  return `${asset}?v=${encodeURIComponent(lineWatchBuildLabel)}`;
}

