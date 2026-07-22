import type { MapPoint } from "../app/map-geometry";
import type { StationNodeImpact } from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import {
  stationImpactDirectionSource,
  type StationImpactDirectionData,
} from "./station-impact-direction.ts";

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

export function stationImpactBelongsToAnchor(
  stationId: string,
  anchorId: string,
  lineId: string | null | undefined,
  displayDirection: string | null | undefined,
): boolean {
  if (stationId !== "spadina") {
    return true;
  }

  const isLine1 = lineId === "line-1";
  const isLine2 = lineId === "line-2";
  const normDir = (displayDirection ?? "").toLowerCase();
  const hasVerticalDir = /\bnorthbound\b|\bsouthbound\b/.test(normDir);
  const hasHorizontalDir = /\beastbound\b|\bwestbound\b/.test(normDir);

  if (anchorId === "spadina-1") {
    if (isLine1 || (hasVerticalDir && !hasHorizontalDir)) return true;
    if (isLine2 || (hasHorizontalDir && !hasVerticalDir)) return false;
  }

  if (anchorId === "spadina-2") {
    if (isLine2 || (hasHorizontalDir && !hasVerticalDir)) return true;
    if (isLine1 || (hasVerticalDir && !hasHorizontalDir)) return false;
  }

  return true;
}

export function stationImpactVisualAnchors(
  station: StationPosition,
  impact: Pick<StationNodeImpact, "stationId" | "kind" | "cardId">,
  data: StationImpactDirectionData,
  stationCenterPoints: ReadonlyMap<string, MapPoint>,
): StationVisualAnchor[] {
  const anchors = stationVisualAnchorsFor(station, stationCenterPoints);
  if (anchors.length <= 1) return anchors;

  const source = stationImpactDirectionSource(impact, data);
  const filtered = anchors.filter((anchor) =>
    stationImpactBelongsToAnchor(
      station.id,
      anchor.id,
      source?.lineId,
      source?.displayDirection,
    ),
  );

  return filtered.length > 0 ? filtered : anchors;
}
