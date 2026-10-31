/**
 * Each System Map's manifest: what the app needs to know about its authored
 * SVG beyond the drawing itself. A new map is this record plus an SVG that
 * passes `npm --prefix frontend run validate:map-asset` (docs/map-asset-contract.md).
 * Pure data, read by the maps, the geometry extractor and the validator.
 */
import type { MapBounds } from "./map-geometry.ts";
import {
  RASTER_MAP_PLANES_BY_NETWORK,
  RASTER_MAP_RENDERED_SIZES,
  type RasterMapPlane,
} from "./map-raster-manifest.ts";

export type MapManifestId = "ttc" | "regional";

export type MapManifest = {
  id: MapManifestId;
  /** The served SVG, relative to `frontend/`. */
  svg: string;
  /** Its prepared geometry, relative to `frontend/` (scripts/prepare-map-geometry.mjs). */
  geometry: string;
  /** The root SVG's view box; every prepared coordinate is in this space. */
  viewBox: MapBounds;
  /** The camera stage in CSS pixels, also the rasters' rendered size; each SVG plane fills it with `xMidYMid meet`. */
  stage: { readonly width: number; readonly height: number };
  /** Map units per TTC overlay unit: the authored alert rail width over TTC's 96. */
  overlayUnit: number;
  /** The drawing's visible art in stage pixels, which the default camera fits. */
  contentBounds: MapBounds;
  /** Raster planes generated from the SVG (map-raster-manifest.ts), in `public/assets/linewatch/raster-maps/`. */
  rasterPlanes: readonly RasterMapPlane[];
  /** Layers the app reads, as CSS selectors on the root SVG. */
  layers: {
    stations: string;
    stationLabels: string;
    lines: string;
    guides?: string;
  };
  /**
   * How a station name finds its station: an attribute the preparation step
   * writes (`attribute`), or by matching the name to the station id (`name`).
   */
  stationLabelLink: { kind: "attribute"; attribute: string } | { kind: "name" };
  /**
   * Id suffixes of shapes drawn for a station rather than being one: a second
   * anchor (`station-spadina-2`) or a junction's line part (`station-union-up`).
   */
  stationPartSuffixes: readonly string[];
  /**
   * Room each station's target adds around its dots, in map units: for a
   * mouse, and for touch (coarse pointers).
   */
  stationHitPadding: { readonly pointer: number; readonly touch: number };
  /** Line paths the overlays follow, by their id in `layers.lines`. */
  lineIds: readonly string[];
  /** Curved or non-linear segment guides, by their `inkscape:label`. */
  guideIds?: readonly string[];
};

const TTC_SCALE = RASTER_MAP_RENDERED_SIZES.ttc.width / 8250;

export const MAP_MANIFESTS: Record<MapManifestId, MapManifest> = {
  ttc: {
    id: "ttc",
    svg: "public/assets/linewatch/ttc-subway-map-custom.svg",
    geometry: "src/app/map-geometry/ttc.json",
    viewBox: { x: 0, y: 0, width: 8250, height: 4000 },
    stage: RASTER_MAP_RENDERED_SIZES.ttc,
    overlayUnit: 1,
    // From the Humber College Line 6 badge (x 65) to the Kennedy label and compass (x 7925).
    contentBounds: {
      x: 65 * TTC_SCALE,
      y: 120 * TTC_SCALE,
      width: (7925 - 65) * TTC_SCALE,
      height: (3840 - 120) * TTC_SCALE,
    },
    rasterPlanes: RASTER_MAP_PLANES_BY_NETWORK.ttc,
    layers: {
      stations: "#ttc-stations-layer",
      stationLabels: "#ttc-station-labels-layer",
      lines: "#ttc-tracks-layer",
      guides: "[inkscape\\:label='non-linear-guides-layer']",
    },
    stationLabelLink: { kind: "attribute", attribute: "data-station-label-for" },
    stationPartSuffixes: ["-1", "-2"],
    stationHitPadding: { pointer: 6, touch: 22 },
    lineIds: ["line-1", "line-2", "line-4", "line-5", "line-6"],
    guideIds: [
      "seg-line-1-st-andrew-union",
      "seg-line-1-union-king",
      "seg-line-1-st-george-spadina",
      "seg-line-6-humber-college-westmore",
    ],
  },
  regional: {
    id: "regional",
    svg: "public/assets/linewatch/regional-rail-map.svg",
    geometry: "src/app/map-geometry/regional.json",
    viewBox: { x: -200, y: -200, width: 17036.959, height: 9031.6719 },
    stage: RASTER_MAP_RENDERED_SIZES.regional,
    // GO/UP's 196-unit rails over TTC's 96-unit overlay rail.
    overlayUnit: 196 / 96,
    // From Kitchener and Stratford to Durham College Oshawa, the VIA badges and the compass.
    contentBounds: { x: 53.08, y: 110.78, width: 4620.46, height: 2395.26 },
    rasterPlanes: RASTER_MAP_PLANES_BY_NETWORK.regional,
    layers: {
      stations: "#regional-stations-layer",
      stationLabels: "#regional-station-labels-layer",
      lines: "#regional-lines-layer",
    },
    stationLabelLink: { kind: "name" },
    stationPartSuffixes: ["-ki", "-up"],
    stationHitPadding: { pointer: 60, touch: 60 },
    lineIds: [
      "regional-route-br-path",
      "regional-route-ki-path",
      "regional-route-le-path",
      "regional-route-lw-branch-path",
      "regional-route-lw-div",
      "regional-route-lw-main-path",
      "regional-route-mi-path",
      "regional-route-rh-path",
      "regional-route-st-path",
      "regional-route-up-airport-path",
      "regional-route-up-path",
    ],
  },
};
