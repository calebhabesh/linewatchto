import React, { memo } from "react";
import { G, Path, Rect } from "react-native-svg";

import type { NetworkSegment, Station } from "@/api/dashboard-schema";
import type { EstimatedTrainMarker } from "@/api/trains-schema";

export const TRAIN_MARKER_BODY_PATH =
  "M -21 -15 H 14 L 36 0 L 14 15 H -21 A 15 15 0 0 1 -36 0 A 15 15 0 0 1 -21 -15 Z";
export const TRAIN_MARKER_ARROW_PATH = "M 13 -8 L 27 0 L 13 8 Z";
export const TRAIN_MARKER_WINDOWS = [
  { x: -27, y: -6, width: 8, height: 12, rx: 1.5 },
  { x: -15, y: -6, width: 8, height: 12, rx: 1.5 },
  { x: -3, y: -6, width: 8, height: 12, rx: 1.5 },
] as const;

const TTC_LANE_OFFSET = 20;
const REGIONAL_LANE_OFFSET = 44;

type TrainMarkerLayerProps = {
  markers: EstimatedTrainMarker[];
  stations: Station[];
  segments: NetworkSegment[];
  lineColors: Record<string, string>;
  network: "ttc" | "regional";
  visible: boolean;
};

type MarkerPlacement = {
  marker: EstimatedTrainMarker;
  x: number;
  y: number;
  angle: number;
  color: string;
};

export const TrainMarkerLayer = memo(function TrainMarkerLayer({
  markers,
  stations,
  lineColors,
  network,
  visible,
}: TrainMarkerLayerProps) {
  if (!visible || markers.length === 0) {
    return null;
  }

  const stationMap = new Map(stations.map((s) => [s.id, s]));
  const offset = network === "regional" ? REGIONAL_LANE_OFFSET : TTC_LANE_OFFSET;
  const markerScale = network === "regional" ? 1.15 : 0.8;

  const placements: MarkerPlacement[] = [];

  for (const marker of markers) {
    const fromStation = stationMap.get(marker.fromStationId);
    const toStation = stationMap.get(marker.toStationId);

    if (!fromStation || !toStation) {
      continue;
    }

    const p = Math.max(0, Math.min(1, marker.progress));
    const baseX = fromStation.x + (toStation.x - fromStation.x) * p;
    const baseY = fromStation.y + (toStation.y - fromStation.y) * p;

    const dx = toStation.x - fromStation.x;
    const dy = toStation.y - fromStation.y;
    const len = Math.hypot(dx, dy);

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    let posX = baseX;
    let posY = baseY;

    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      const dirSign = marker.travelDirection === "reverse" ? -1 : 1;
      posX = baseX + nx * offset * dirSign;
      posY = baseY + ny * offset * dirSign;

      if (marker.travelDirection === "reverse") {
        angle += 180;
      }
    }

    const color = lineColors[marker.lineId] || "#F8C300";

    placements.push({
      marker,
      x: posX,
      y: posY,
      angle,
      color,
    });
  }

  return (
    <G testID={`estimated-train-markers-layer-${network}`}>
      {placements.map(({ marker, x, y, angle, color }) => (
        <G
          key={`train-marker-${marker.id}`}
          testID={`train-marker-${marker.id}`}
          transform={`translate(${x}, ${y}) rotate(${angle}) scale(${markerScale})`}
          accessible
          accessibilityLabel={`${marker.direction} estimated train toward ${marker.nextStationId}`}
        >
          {/* Outline */}
          <Path
            d={TRAIN_MARKER_BODY_PATH}
            fill="#08090b"
            stroke="#08090b"
            strokeWidth={8}
            strokeLinejoin="round"
          />
          {/* Main Body */}
          <Path
            d={TRAIN_MARKER_BODY_PATH}
            fill={color}
            stroke="#ffffff"
            strokeWidth={2}
          />
          {/* Windows */}
          {TRAIN_MARKER_WINDOWS.map((win) => (
            <Rect
              key={win.x}
              x={win.x}
              y={win.y}
              width={win.width}
              height={win.height}
              rx={win.rx}
              fill="#08090b"
            />
          ))}
          {/* Arrow */}
          <Path
            d={TRAIN_MARKER_ARROW_PATH}
            fill="#08090b"
          />
        </G>
      ))}
    </G>
  );
});
