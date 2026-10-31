/**
 * Each System Map's manifest: what the app needs to know about its authored
 * SVG beyond the drawing itself. A new map is this record plus an SVG that
 * passes `npm --prefix frontend run validate:map-asset` (docs/map-asset-contract.md).
 * Pure data, read by the maps, the geometry extractor and the validator.
 */
import type { MapBounds } from "./map-geometry.ts";
import type { StationLabelPadding } from "./map-geometry-data.ts";
import type { NetworkId } from "./dashboard-contract.ts";
import {
  RASTER_MAP_PLANES_BY_MAP,
  RASTER_MAP_RENDERED_SIZES,
  type RasterMapPlane,
} from "./map-raster-manifest.ts";

/**
 * A System Map, apart from the network whose data it shows: a future TTC
 * streetcar map (`ttc-streetcar`) would be a second map of network `ttc`.
 * The id names the map's element hooks (`data-system-map`), plane group ids,
 * raster files and saved camera, so it stays stable once a map ships.
 */
export type MapId = "ttc" | "regional";

/**
 * A map's manifest. Shipped maps are `MapManifest` (keyed by `MapId`); a test
 * fixture names its own id (`MapManifest<"drop-in">`).
 */
export type MapManifest<Id extends string = MapId> = {
  id: Id;
  /** The network whose data the map shows (and whose content adapter draws it). */
  network: NetworkId;
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
  /**
   * Station names. `targetPadding` is the room a name's pointer target adds
   * around its box, `hoverPadding` the room its lifted hover copy takes, both
   * in the label's own units. The hover copy cuts the name's glyphs out of the
   * label texture with an element of the prepared artwork, by id prefix plus
   * station id: the label itself (`use`), or a prepared glyph copy (`copy`) when
   * the label sits in a transformed layer, which `<use>` would drop. `dilate`
   * widens the glyph mask, in map units.
   */
  stationLabels: {
    targetPadding: StationLabelPadding;
    hoverPadding: StationLabelPadding;
    cutout: { kind: "use" | "copy"; idPrefix: string; dilate: number };
  };
  /** The default camera frame: phones zoom on a station; side insets as a share of the width. */
  framing: {
    mobileZoom: number;
    mobileCenterStationId: string;
    horizontalInsetRatio: number;
  };
  /** The north compass, in view box units. */
  compass: MapBounds;
  /** Whose map the drawing re-creates, for the attribution notice. */
  attributionSource: string;
  /** The map's accessible name. */
  label: string;
  /**
   * Line paths the overlays follow, by their `id` or `inkscape:label` in
   * `layers.lines`: the paths the geometry extractor keeps.
   */
  lineIds: readonly string[];
  /** Curved or non-linear segment guides, by their `inkscape:label`. */
  guideIds?: readonly string[];
  /**
   * The artwork overlap badges keep clear of, as CSS selectors on the root
   * SVG (read by `prepare:map-geometry`). Defaults to `mapBadgeObstacles`'s.
   */
  badgeObstacles?: MapBadgeObstacles;
};

export type MapBadgeObstacles = {
  /** Elements badges never avoid, with their contents (definitions, guides). */
  ignore: string;
  /** Text, kept clear as rotated boxes. */
  text: string;
  /** Other artwork, kept clear as boxes, by kind. */
  boxes: Partial<Record<"artwork" | "connection-label" | "line-badge", string>>;
  /** Whether stroke-only paths among `boxes` become corridors rather than boxes. */
  strokes: boolean;
};

/** A map's badge obstacles: its manifest's, or its text and station dots. */
export function mapBadgeObstacles(manifest: Pick<MapManifest<string>, "badgeObstacles" | "layers">): MapBadgeObstacles {
  return manifest.badgeObstacles ?? {
    ignore: "defs",
    text: "text",
    boxes: { artwork: `${manifest.layers.stations} :is(rect, circle, ellipse)` },
    strokes: false,
  };
}

const TTC_SCALE = RASTER_MAP_RENDERED_SIZES.ttc.width / 8250;

export const MAP_MANIFESTS: Record<MapId, MapManifest> = {
  ttc: {
    id: "ttc",
    network: "ttc",
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
    rasterPlanes: RASTER_MAP_PLANES_BY_MAP.ttc,
    layers: {
      stations: "#ttc-stations-layer",
      stationLabels: "#ttc-station-labels-layer",
      lines: "#ttc-tracks-layer",
      guides: "[inkscape\\:label='non-linear-guides-layer']",
    },
    stationLabelLink: { kind: "attribute", attribute: "data-station-label-for" },
    stationPartSuffixes: ["-1", "-2"],
    stationHitPadding: { pointer: 6, touch: 22 },
    stationLabels: {
      targetPadding: { leading: 0, trailing: 68, y: 8 },
      hoverPadding: { leading: 0, trailing: 68, y: 8 },
      cutout: { kind: "use", idPrefix: "station-label-", dilate: 4 },
    },
    framing: {
      mobileZoom: 1.65,
      mobileCenterStationId: "union",
      horizontalInsetRatio: 0.025,
    },
    compass: { x: 7600, y: 2300, width: 300, height: 400 },
    attributionSource: "TTC",
    label: "Interactive TTC subway map",
    lineIds: ["line-1", "line-2", "line-4", "line-5", "line-6"],
    guideIds: [
      "seg-line-1-st-andrew-union",
      "seg-line-1-union-king",
      "seg-line-1-st-george-spadina",
      "seg-line-6-humber-college-westmore",
    ],
    badgeObstacles: {
      ignore: "#non-linear-guides-layer, defs",
      text: "text, tspan",
      // Every other drawn element; stroke-only paths become corridors.
      boxes: { artwork: "path, rect, circle, ellipse, polygon, polyline, image, use" },
      strokes: true,
    },
  },
  regional: {
    id: "regional",
    network: "regional",
    svg: "public/assets/linewatch/regional-rail-map.svg",
    geometry: "src/app/map-geometry/regional.json",
    viewBox: { x: -200, y: -200, width: 17036.959, height: 9031.6719 },
    stage: RASTER_MAP_RENDERED_SIZES.regional,
    // GO/UP's 196-unit rails over TTC's 96-unit overlay rail.
    overlayUnit: 196 / 96,
    // From Kitchener and Stratford to Durham College Oshawa, the VIA badges and the compass.
    contentBounds: { x: 53.08, y: 110.78, width: 4620.46, height: 2395.26 },
    rasterPlanes: RASTER_MAP_PLANES_BY_MAP.regional,
    layers: {
      stations: "#regional-stations-layer",
      stationLabels: "#regional-station-labels-layer",
      lines: "#regional-lines-layer",
    },
    stationLabelLink: { kind: "name" },
    stationPartSuffixes: ["-ki", "-up"],
    stationHitPadding: { pointer: 60, touch: 60 },
    stationLabels: {
      targetPadding: { leading: 0, trailing: 0, y: 0 },
      hoverPadding: { leading: 0, trailing: 80, y: 12 },
      cutout: { kind: "copy", idPrefix: "regional-station-label-cutout-source-", dilate: 6 },
    },
    framing: {
      // A little under the fitted network, so Allandale Waterfront and Hamilton clear the chrome.
      mobileZoom: 0.95 * 1.15,
      mobileCenterStationId: "union",
      horizontalInsetRatio: 0.025,
    },
    compass: { x: 14800, y: 5100, width: 1000, height: 1000 },
    attributionSource: "Metrolinx",
    label: "Interactive GO and UP map",
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
    badgeObstacles: {
      ignore: "defs",
      text: "text",
      boxes: {
        "connection-label": "g:is([inkscape\\:label^='via-rail-'], [inkscape\\:label$='airport-icon'])",
        artwork: "#regional-stations-layer :is(rect, circle, ellipse)",
        "line-badge": "#regional-route-labels-layer :is(rect, path, image, use)",
      },
      strokes: false,
    },
  },
};

/** The served URL of a map's SVG: its path under `public/`, from the site root. */
export function mapArtworkUrl({ svg }: Pick<MapManifest<string>, "svg">): string {
  return `/${svg.replace(/^public\//, "")}`;
}

/**
 * The map each network shows. The shell stays two-network; a network with
 * several maps would need a switcher (an open owner question), so each names
 * one map here.
 */
export const NETWORK_MAPS: Record<NetworkId, MapId> = {
  ttc: "ttc",
  regional: "regional",
};
