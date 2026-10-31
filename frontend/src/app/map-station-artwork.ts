/*
 * Every System Map's station targets, hover rings and selection markers, from
 * its prepared station artwork (map-geometry-data.ts). The maps draw them as
 * React elements in their own planes (components/MapStationLayers.tsx), never
 * inside the authored SVG, so a station's target has the shape of its dot.
 */
import type { MapBounds, MapPoint } from "./map-geometry.ts";
import {
  stationLabelCenter,
  stationLabelPolygon,
  type PreparedMapGeometry,
  type PreparedStationShape,
  type StationLabelPadding,
} from "./map-geometry-data.ts";
import { matrixTransform } from "./regional-map-geometry.ts";

export type MapStationShape = PreparedStationShape;

/** One station's artwork: shapes in its own coordinates, placed by `transform`. */
export type MapStationArtwork = {
  id: string;
  /** Drawn markedly larger than the map's usual dot (terminals, interchanges). */
  large: boolean;
  /** Station coordinates to root coordinates. */
  transform: string;
  shapes: MapStationShape[];
  /** The largest dot's radius, in root coordinates. */
  dotRadius: number;
  /** How far the dots may grow before two of them touch: Spadina's pair. */
  growthLimit: number;
};

/** A station the map's network has data for, by id; its name labels its target. */
export type MapStationListing = {
  id: string;
  name: string;
  /**
   * Where to place a station the artwork does not draw, as a regular dot.
   * Only for networks whose data carries map positions (TTC).
   */
  fallbackPoint?: MapPoint;
};

/** A placed station: its artwork and the name its target is announced by. */
export type MapStationPlacement = { artwork: MapStationArtwork; name: string };

/** A station name's pointer box, in the root SVG's coordinates. */
export type MapStationLabelTarget = { stationId: string; points: MapPoint[] };

/** A dot this much larger than the map's median dot is a large station. */
const LARGE_DOT_RATIO = 1.5;

const HOVER_GROWTH = { regular: 1.45, large: 1.35 } as const;
const SELECTION_GROWTH = { regular: 1.2, large: 1 } as const;

/**
 * Every station's artwork. Elements named with one of the manifest's
 * `stationPartSuffixes` (`station-spadina-1`, `-2`) are parts of one station;
 * parts drawn inside a station's own group (a junction's `-ki` and `-up`) are
 * already its shapes.
 */
export function mapStationArtwork(
  geometry: PreparedMapGeometry,
  partSuffixes: readonly string[],
): MapStationArtwork[] {
  const parts = new Map<string, PreparedMapGeometry["stations"]>();
  for (const station of geometry.stations) {
    const elementId = station.id.replace(/^station-/, "");
    const suffix = partSuffixes.find((candidate) => elementId.endsWith(candidate));
    const id = suffix ? elementId.slice(0, -suffix.length) : elementId;
    parts.set(id, [...(parts.get(id) ?? []), station]);
  }
  const stations = [...parts].map(([id, elements]) => {
    const anchors = elements.flatMap((element) => element.anchors);
    const single = elements.length === 1;
    return {
      id,
      transform: single ? matrixTransform(elements[0].transform) : "",
      // Several elements: each shape carries its element's placement.
      shapes: single
        ? elements[0].shapes
        : elements.flatMap((element) => element.shapes.map((shape) => ({
            ...shape,
            transform: [matrixTransform(element.transform), shape.transform].filter(Boolean).join(" "),
          }))),
      dotRadius: Math.max(...anchors.map((anchor) => anchor.radius)),
      growthLimit: dotGrowthLimit(anchors),
    };
  });
  const radii = stations.map((station) => station.dotRadius).sort((a, b) => a - b);
  const medianRadius = radii[Math.floor(radii.length / 2)] ?? 0;
  return stations.map((station) => ({
    ...station,
    large: station.dotRadius > medianRadius * LARGE_DOT_RATIO,
  }));
}

/** The factor two of a station's dots can grow by before they touch. */
function dotGrowthLimit(anchors: readonly (MapPoint & { radius: number })[]): number {
  let limit = Infinity;
  for (const [index, a] of anchors.entries()) {
    for (const b of anchors.slice(index + 1)) {
      limit = Math.min(limit, Math.hypot(a.x - b.x, a.y - b.y) / (a.radius + b.radius));
    }
  }
  return limit;
}

/**
 * The stations to draw targets for: those the network has data for. A drawn
 * station takes its artwork's shape; one the artwork lacks is a regular dot at
 * its `fallbackPoint`, or is left out. Artwork objects are reused, so a
 * memoized station re-renders only when its own inputs change.
 */
export function placeMapStations(
  artwork: readonly MapStationArtwork[],
  stations: readonly MapStationListing[],
): MapStationPlacement[] {
  const byId = new Map(artwork.map((station) => [station.id, station]));
  const radii = artwork.map((station) => station.dotRadius).sort((a, b) => a - b);
  const regularRadius = radii[Math.floor(radii.length / 2)] ?? 0;
  return stations.flatMap(({ id, name, fallbackPoint }): MapStationPlacement[] => {
    const drawn = byId.get(id);
    if (drawn) return [{ artwork: drawn, name }];
    if (!fallbackPoint) return [];
    return [{
      name,
      artwork: {
        id,
        large: false,
        transform: "",
        shapes: [{ tag: "circle", id: `station-${id}`, cx: fallbackPoint.x, cy: fallbackPoint.y, r: regularRadius }],
        dotRadius: regularRadius,
        growthLimit: Infinity,
      },
    }];
  });
}

/** The station's dots grown by `factor`, without junction bars. */
function grownDots(station: MapStationArtwork, factor: number): MapStationShape[] {
  return station.shapes.flatMap((shape): MapStationShape[] => {
    if (shape.tag === "circle") return [{ ...shape, r: shape.r * factor }];
    if (shape.tag === "ellipse") return [{ ...shape, rx: shape.rx * factor, ry: shape.ry * factor }];
    if (shape.join) return [];
    // A pill (Union) grows by the same margin on every side.
    const padding = (Math.min(shape.width, shape.height) * (factor - 1)) / 2;
    return [{
      ...shape,
      x: shape.x - padding,
      y: shape.y - padding,
      width: shape.width + padding * 2,
      height: shape.height + padding * 2,
      rx: shape.rx ? shape.rx + padding : 0,
      ry: shape.ry ? shape.ry + padding : 0,
    }];
  });
}

function growth(station: MapStationArtwork, sizes: { regular: number; large: number }): number {
  return Math.min(station.large ? sizes.large : sizes.regular, station.growthLimit);
}

/** The station's hover ring: its dots grown, without junction bars. */
export function mapStationHoverShapes(station: MapStationArtwork): MapStationShape[] {
  return grownDots(station, growth(station, HOVER_GROWTH));
}

/** The selected station's marker: its dots, a little larger, without junction bars. */
export function mapStationSelectionShapes(station: MapStationArtwork): MapStationShape[] {
  return grownDots(station, growth(station, SELECTION_GROWTH));
}

/** A dot shape's station anchor id (`spadina-1`), or null for a junction bar. */
export function mapStationShapeAnchorId(shape: MapStationShape): string | null {
  return shape.tag === "rect" && shape.join ? null : shape.id.replace(/^station-/, "");
}

/** Each listed station's name target, padded by the map's `stationLabels.targetPadding`. */
export function mapStationLabelTargets(
  geometry: PreparedMapGeometry,
  stationIds: readonly string[],
  padding: StationLabelPadding,
): MapStationLabelTarget[] {
  return stationIds.flatMap((stationId) => {
    const points = stationLabelPolygon(geometry.labels, stationId, padding);
    return points ? [{ stationId, points }] : [];
  });
}

/** A hovered station name's lifted copy: its box, centre and mask bounds, in root coordinates. */
export type MapStationLabelHover = {
  stationId: string;
  points: MapPoint[];
  center: MapPoint;
  bounds: MapBounds;
};

/** Room around the lifted name that its masks keep, in map units. */
const LABEL_HOVER_MASK_MARGIN = 20;

/** The lifted copy of a station's name, padded by the map's `stationLabels.hoverPadding`. */
export function mapStationLabelHover(
  geometry: PreparedMapGeometry,
  stationId: string,
  padding: StationLabelPadding,
): MapStationLabelHover | null {
  const points = stationLabelPolygon(geometry.labels, stationId, padding);
  const center = stationLabelCenter(geometry.labels, stationId);
  if (!points || !center) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    stationId,
    points,
    center,
    bounds: {
      x: minX - LABEL_HOVER_MASK_MARGIN,
      y: minY - LABEL_HOVER_MASK_MARGIN,
      width: Math.max(...xs) - minX + LABEL_HOVER_MASK_MARGIN * 2,
      height: Math.max(...ys) - minY + LABEL_HOVER_MASK_MARGIN * 2,
    },
  };
}
