import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";
import Svg from "react-native-svg";

import type { EstimatedTrainMarker } from "@/api/trains-schema";
import { TrainMarkerLayer } from "@/features/map/train-marker-layer";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

const mockMarkers: EstimatedTrainMarker[] = [
  {
    id: "train-1",
    lineId: "line-1",
    direction: "Northbound",
    travelDirection: "forward",
    segmentId: "line-1-union-king",
    fromStationId: "union",
    toStationId: "king",
    nextStationId: "king",
    progress: 0.5,
    segmentTravelSeconds: 120,
    predictedAt: "2026-09-02T01:15:00Z",
  },
  {
    id: "train-2",
    lineId: "line-1",
    direction: "Northbound",
    travelDirection: "forward",
    segmentId: "line-1-king-queen",
    fromStationId: "king",
    toStationId: "queen",
    nextStationId: "queen",
    progress: 0.3,
    segmentTravelSeconds: 100,
    predictedAt: "2026-09-02T01:15:00Z",
  },
];

describe("TrainMarkerLayer Component", () => {
  it("renders train markers when visible and stations exist", async () => {
    const { getByTestId } = await render(
      <Svg>
        <TrainMarkerLayer
          lineColors={{ "line-1": "#F8C300", "line-2": "#00923F" }}
          markers={mockMarkers}
          network="ttc"
          segments={mockTtcDashboard.map.segments}
          stations={mockTtcDashboard.map.stations}
          visible={true}
        />
      </Svg>,
    );

    expect(getByTestId("estimated-train-markers-layer-ttc")).toBeTruthy();
    expect(getByTestId("train-marker-train-1")).toBeTruthy();
    expect(getByTestId("train-marker-train-2")).toBeTruthy();
  });

  it("does not render when visible is false", async () => {
    const { queryByTestId } = await render(
      <Svg>
        <TrainMarkerLayer
          lineColors={{ "line-1": "#F8C300" }}
          markers={mockMarkers}
          network="ttc"
          segments={mockTtcDashboard.map.segments}
          stations={mockTtcDashboard.map.stations}
          visible={false}
        />
      </Svg>,
    );

    expect(queryByTestId("estimated-train-markers-layer-ttc")).toBeNull();
  });

  it("does not render when markers array is empty", async () => {
    const { queryByTestId } = await render(
      <Svg>
        <TrainMarkerLayer
          lineColors={{ "line-1": "#F8C300" }}
          markers={[]}
          network="ttc"
          segments={mockTtcDashboard.map.segments}
          stations={mockTtcDashboard.map.stations}
          visible={true}
        />
      </Svg>,
    );

    expect(queryByTestId("estimated-train-markers-layer-ttc")).toBeNull();
  });
});
