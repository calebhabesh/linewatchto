import type { GeographicNetworkMapProps } from "./GeographicNetworkMap";
import { preloadablePanel } from "./preloadable-panel";

/** The Map View, its code (MapLibre with it) loaded apart from the app's and preloaded when a switch to it is likely. */
export const PreloadableGeographicMap = preloadablePanel<GeographicNetworkMapProps>(
  () => import("./GeographicNetworkMap").then((mod) => mod.GeographicNetworkMap),
);
