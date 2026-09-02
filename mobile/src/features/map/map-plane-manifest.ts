import type { ImageSourcePropType } from "react-native";

import type { ThemeMode } from "@/theme/tokens";

export type MapNetworkId = "ttc" | "regional";
export type MapPlaneKind = "background" | "foreground" | "labels";
export type MapPlaneTheme = ThemeMode;

export const TTC_MAP_PLANES = {
  dark: {
    background: require("../../../assets/linewatch/ttc-background-dark-mobile.png") as ImageSourcePropType,
    foreground: require("../../../assets/linewatch/ttc-foreground-dark-mobile.png") as ImageSourcePropType,
    labels: require("../../../assets/linewatch/ttc-labels-dark-mobile.png") as ImageSourcePropType,
  },
  "high-contrast": {
    background: require("../../../assets/linewatch/ttc-background-high-contrast-mobile.png") as ImageSourcePropType,
    foreground: require("../../../assets/linewatch/ttc-foreground-high-contrast-mobile.png") as ImageSourcePropType,
    labels: require("../../../assets/linewatch/ttc-labels-high-contrast-mobile.png") as ImageSourcePropType,
  },
} as const;

export const REGIONAL_MAP_PLANES = {
  dark: {
    background: require("../../../assets/linewatch/regional-background-dark-mobile.png") as ImageSourcePropType,
    foreground: require("../../../assets/linewatch/regional-foreground-dark-mobile.png") as ImageSourcePropType,
    labels: require("../../../assets/linewatch/regional-labels-dark-mobile.png") as ImageSourcePropType,
  },
  "high-contrast": {
    background: require("../../../assets/linewatch/regional-background-high-contrast-mobile.png") as ImageSourcePropType,
    foreground: require("../../../assets/linewatch/regional-foreground-high-contrast-mobile.png") as ImageSourcePropType,
    labels: require("../../../assets/linewatch/regional-labels-high-contrast-mobile.png") as ImageSourcePropType,
  },
} as const;

export const MAP_PLANE_MANIFEST = {
  ttc: {
    id: "ttc",
    name: "TTC Subway & LRT",
    viewBox: "0 0 8250 4000",
    viewBoxWidth: 8250,
    viewBoxHeight: 4000,
    aspectRatio: 8250 / 4000, // 2.0625
    planes: {
      background: {
        width: 3000,
        height: 1455,
        aspectRatio: 3000 / 1455,
        byteSize: 45335,
        description: "Geographical base layer (land boundaries, base guides)",
      },
      foreground: {
        width: 3000,
        height: 1455,
        aspectRatio: 3000 / 1455,
        byteSize: 153923,
        description: "Rapid transit tracks, lines, station pill symbols and ticks",
      },
      labels: {
        width: 3000,
        height: 1455,
        aspectRatio: 3000 / 1455,
        byteSize: 522051,
        description: "Station names, line badges, and terminal text",
      },
    },
    sources: TTC_MAP_PLANES,
  },
  regional: {
    id: "regional",
    name: "GO Rail & UP Express",
    viewBox: "-200 -200 17036.959 9031.6719",
    viewBoxWidth: 17036.959,
    viewBoxHeight: 9031.6719,
    aspectRatio: 17036.959 / 9031.6719, // ~1.88636
    planes: {
      background: {
        width: 3200,
        height: 1767,
        aspectRatio: 3200 / 1767,
        byteSize: 132798,
        description: "Regional base landmass, lakes, and zone geography",
      },
      foreground: {
        width: 3200,
        height: 1767,
        aspectRatio: 3200 / 1767,
        byteSize: 169932,
        description: "GO rail corridor tracks, UP Express route lines, and station markers",
      },
      labels: {
        width: 3200,
        height: 1696,
        aspectRatio: 3200 / 1696,
        byteSize: 341095,
        description: "Regional rail station names, terminal labels, and transfer badges",
      },
    },
    sources: REGIONAL_MAP_PLANES,
  },
} as const;

export function getMapPlaneSource(
  network: MapNetworkId,
  plane: MapPlaneKind,
  theme: MapPlaneTheme,
): ImageSourcePropType {
  if (network === "ttc") {
    const themeSources = TTC_MAP_PLANES[theme] ?? TTC_MAP_PLANES.dark;
    return themeSources[plane];
  }

  const themeSources = REGIONAL_MAP_PLANES[theme] ?? REGIONAL_MAP_PLANES.dark;
  return themeSources[plane];
}

export function getMapPlaneDimensions(
  network: MapNetworkId,
  plane: MapPlaneKind,
) {
  return MAP_PLANE_MANIFEST[network].planes[plane];
}

export function getNetworkViewBox(network: MapNetworkId): string {
  return MAP_PLANE_MANIFEST[network].viewBox;
}

export function getNetworkAspectRatio(network: MapNetworkId): number {
  return MAP_PLANE_MANIFEST[network].aspectRatio;
}
