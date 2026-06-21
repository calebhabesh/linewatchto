import type { MapPoint } from "../app/map-geometry";
import type { StationSummary } from "../app/station-data";

export type StationVisualAnchor = {
  id: string;
  point: MapPoint;
};

type StationIdentity = Pick<StationSummary, "id">;
type StationPosition = Pick<StationSummary, "id" | "mapX" | "mapY">;

const SPECIAL_STATION_VISUAL_ANCHORS: Partial<Record<string, readonly string[]>> = {
  spadina: ["spadina-1", "spadina-2"],
};

export function stationVisualAnchorIds(stationId: string): string[] {
  return [...(SPECIAL_STATION_VISUAL_ANCHORS[stationId] ?? [stationId])];
}

export function stationVisualCenterIds(stations: readonly StationIdentity[]): string[] {
  return [...new Set(stations.flatMap((station) => stationVisualAnchorIds(station.id)))];
}

export function stationVisualAnchorsFor(
  station: StationPosition,
  stationCenterPoints: ReadonlyMap<string, MapPoint>,
): StationVisualAnchor[] {
  const anchorIds = stationVisualAnchorIds(station.id);
  const resolved = anchorIds.flatMap((anchorId) => {
    const point = stationCenterPoints.get(anchorId);
    return point ? [{ id: anchorId, point }] : [];
  });

  if (resolved.length === anchorIds.length) {
    return resolved;
  }

  return [{
    id: station.id,
    point: stationCenterPoints.get(station.id) ?? {
      x: station.mapX,
      y: station.mapY,
    },
  }];
}
