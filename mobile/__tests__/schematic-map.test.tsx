import { act, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React, { type PropsWithChildren } from "react";

import { dashboardSchema, type Dashboard } from "@/api/dashboard-schema";
import { SchematicMap } from "@/features/map/schematic-map";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const mockTtcDashboard: Dashboard = dashboardSchema.parse({
  networkId: "ttc",
  availability: "available",
  sourceSystems: ["ttc-live-alerts"],
  message: "Freshness-gated dashboard data.",
  map: {
    stations: [
      { id: "union", name: "Union", x: 4311, y: 3597, interchange: true },
      { id: "king", name: "King", x: 4547, y: 3362, interchange: false },
    ],
    segments: [
      {
        id: "line-1-union-king",
        lineId: "line-1",
        label: "Union to King",
        stationAId: "union",
        stationBId: "king",
        stationAAnchorId: null,
        stationBAnchorId: null,
        guidePathId: null,
        guidePathReversed: false,
        pathD: "M 4311 3597 L 4547 3362",
        impacts: [
          {
            kind: "suspension",
            cardId: "alert-1",
            travelDirection: "bidirectional",
            sourceAlertIds: ["alert-1"],
          },
        ],
        overlay: "suspension",
        travelDirection: "bidirectional",
        sourceAlertIds: ["alert-1"],
        reducedSpeedZoneIds: [],
        alertId: "alert-1",
      },
    ],
    stationNodeImpacts: [],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "succeeded just now" },
    lines: [
      {
        id: "line-1",
        number: "1",
        name: "Yonge-University",
        route: "Finch - Vaughan Metropolitan Centre",
        color: "#F8C300",
        status: "suspension",
        statusLabel: "Suspension",
        summary: "Suspension between Union and King.",
        updatedAgo: "Updated recently",
      },
    ],
  },
  activeAlerts: [
    {
      id: "alert-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "Line 1: Service suspended",
      location: "Union to King",
      displayDirection: "Both ways",
      description: "No service between Union and King due to track work.",
      startedAt: "9:00 AM",
      updatedAt: "9:30 AM",
      source: "TTC Live Alerts",
      cause: "Track work",
      severity: "suspension",
      affectedSegmentIds: ["line-1-union-king"],
      shuttle: true,
      resolution: null,
      relatedPlannedClosureId: null,
    },
  ],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  performance: { status: "available" },
});

const mockRegionalDashboard: Dashboard = dashboardSchema.parse({
  networkId: "regional",
  availability: "available",
  sourceSystems: ["metrolinx-api"],
  message: "Regional dashboard data.",
  map: {
    stations: [
      { id: "union", name: "Union Station", x: 8000, y: 4500, interchange: true },
    ],
    segments: [],
    stationNodeImpacts: [],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "succeeded just now" },
    lines: [
      {
        id: "lw",
        number: "LW",
        name: "Lakeshore West",
        route: "Union - Niagara Falls",
        color: "#990000",
        status: "normal",
        statusLabel: "Normal",
        summary: "On schedule",
        updatedAgo: "Updated recently",
      },
    ],
  },
  activeAlerts: [],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  performance: { status: "available" },
});

describe("SchematicMap Component", () => {
  it("renders TTC map with background, foreground, and label raster planes", async () => {
    await render(<SchematicMap dashboard={mockTtcDashboard} />, { wrapper: Wrapper });

    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-ttc-background")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-ttc-foreground")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-ttc-labels")).toBeTruthy();
  });

  it("renders Regional map with regional raster planes when networkId is regional", async () => {
    await render(<SchematicMap dashboard={mockRegionalDashboard} />, { wrapper: Wrapper });

    expect(screen.getByTestId("schematic-map-regional")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-background")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-foreground")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-labels")).toBeTruthy();
  });

  it("renders dynamic impact overlays and interactive hit targets for affected segments", async () => {
    await render(<SchematicMap dashboard={mockTtcDashboard} />, { wrapper: Wrapper });

    expect(
      screen.getByTestId("impact-path-line-1-union-king", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId("impact-target-line-1-union-king")).toBeTruthy();
    expect(
      screen.getByText("Tap a highlighted impact segment. Pan and pinch gestures are scaffolded as the next map slice."),
    ).toBeTruthy();
  });

  it("updates caption when an impact segment hit target is pressed", async () => {
    await render(<SchematicMap dashboard={mockTtcDashboard} />, { wrapper: Wrapper });

    const hitTarget = screen.getByTestId("impact-target-line-1-union-king");
    const pathFiber = (hitTarget as any)?.instance?.unstable_fiber?.return?.return;
    if (pathFiber?.memoizedProps?.onPress) {
      await act(async () => {
        pathFiber.memoizedProps.onPress();
      });
    }

    expect(screen.getByText("suspension · Union to King")).toBeTruthy();
  });
});
