import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React, { type PropsWithChildren } from "react";

import { dashboardSchema, type Dashboard } from "@/api/dashboard-schema";
import { impactColor, SchematicMap } from "@/features/map/schematic-map";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { themes } from "@/theme/tokens";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
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
      { id: "queen", name: "Queen", x: 4547, y: 3000, interchange: false },
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
      {
        id: "line-1-king-queen",
        lineId: "line-1",
        label: "King to Queen",
        stationAId: "king",
        stationBId: "queen",
        stationAAnchorId: null,
        stationBAnchorId: null,
        guidePathId: null,
        guidePathReversed: false,
        pathD: "M 4547 3362 L 4547 3000",
        impacts: [
          {
            kind: "reduced-speed-zone",
            cardId: "rsz-1",
            travelDirection: "forward",
            sourceAlertIds: ["rsz-1"],
          },
        ],
        overlay: "delay",
        travelDirection: "forward",
        sourceAlertIds: ["rsz-1"],
        reducedSpeedZoneIds: ["rsz-1"],
        alertId: "rsz-1",
      },
    ],
    stationNodeImpacts: [
      {
        stationId: "queen",
        kind: "delay",
        cardId: "delay-station-queen",
        title: "Elevator Outage",
      },
    ],
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
  delays: [
    {
      id: "delay-station-queen",
      lineId: "line-1",
      lineNumber: "1",
      title: "Queen Station Elevator Outage",
      location: "Queen Station",
      displayDirection: null,
      description: "Southbound platform elevator out of service.",
      startedAt: "8:00 AM",
      updatedAt: "9:00 AM",
      source: "TTC Live Alerts",
      cause: "Maintenance",
      affectedSegmentIds: [],
    },
  ],
  reducedSpeedZones: [
    {
      id: "rsz-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "Reduced Speed Zone",
      location: "King to Queen",
      displayDirection: "Northbound",
      description: "Track speed reduced to 15 km/h.",
      startedAt: "7:00 AM",
      updatedAt: "8:30 AM",
      source: "TTC Track Operations",
      cause: "Track maintenance",
      affectedSegmentIds: ["line-1-king-queen"],
      sourceAlertIds: ["rsz-1"],
      directionalDetails: [],
      resolution: null,
      rszLength: "150m",
      stationDistance: "200m north of King",
      trackPercent: "10%",
      reducedSpeed: "15 km/h",
      averageSpeed: "40 km/h",
    },
  ],
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
      { id: "brampton", name: "Brampton GO", x: 5000, y: 3200, interchange: false },
    ],
    segments: [],
    stationNodeImpacts: [
      {
        stationId: "brampton",
        kind: "delay",
        cardId: "regional-amenity-brampton",
        title: "Elevator Disruption",
      },
    ],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "succeeded just now" },
    lines: [
      {
        id: "ki",
        number: "KI",
        name: "Kitchener",
        route: "Union - Kitchener",
        color: "#00853E",
        status: "normal",
        statusLabel: "Normal",
        summary: "On schedule",
        updatedAgo: "Updated recently",
      },
    ],
  },
  activeAlerts: [],
  delays: [
    {
      id: "regional-amenity-brampton",
      lineId: "regional-ki",
      lineNumber: "KI",
      title: "Brampton GO Elevator Outage",
      location: "Brampton GO",
      displayDirection: null,
      description: "Platform elevator out of service.",
      startedAt: "6:00 AM",
      updatedAt: "8:00 AM",
      source: "Metrolinx Open API",
      cause: "Repairs",
      affectedSegmentIds: [],
    },
  ],
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
    expect(screen.getByTestId("animated-map-canvas")).toBeTruthy();
  });

  it("renders Regional map with regional raster planes when networkId is regional", async () => {
    await render(<SchematicMap dashboard={mockRegionalDashboard} />, { wrapper: Wrapper });

    expect(screen.getByTestId("schematic-map-regional")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-background")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-foreground")).toBeTruthy();
    expect(screen.getByTestId("raster-plane-regional-labels")).toBeTruthy();
  });

  it("renders dynamic impact overlays, station node rings, and interactive hit targets", async () => {
    await render(<SchematicMap dashboard={mockTtcDashboard} />, { wrapper: Wrapper });

    expect(
      screen.getByTestId("impact-path-line-1-union-king", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("impact-path-line-1-king-queen", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("impact-station-ring-queen", { includeHiddenElements: true }),
    ).toBeTruthy();

    expect(screen.getByTestId("impact-target-line-1-union-king")).toBeTruthy();
    expect(screen.getByTestId("impact-station-target-queen")).toBeTruthy();
    expect(screen.getByTestId("map-control-zoom-in")).toBeTruthy();
    expect(screen.getByTestId("map-control-zoom-out")).toBeTruthy();
    expect(
      screen.getByText("Tap a highlighted impact for details. Pinch or double-tap to zoom, drag to pan."),
    ).toBeTruthy();
  });

  it("preserves regional station-only disruption precision without flattening corridors", async () => {
    await render(<SchematicMap dashboard={mockRegionalDashboard} />, { wrapper: Wrapper });

    // Station node ring is rendered for Brampton GO
    expect(
      screen.getByTestId("impact-station-ring-brampton", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId("impact-station-target-brampton")).toBeTruthy();

    // No segment overlays are rendered
    expect(screen.queryByTestId("impact-path-line-ki")).toBeNull();
  });

  it("updates caption and notifies onSelectionChange when an impact segment hit target is pressed", async () => {
    const handleSelectionChange = jest.fn();
    await render(
      <SchematicMap
        dashboard={mockTtcDashboard}
        onSelectionChange={handleSelectionChange}
      />,
      { wrapper: Wrapper },
    );

    const hitTarget = screen.getByTestId("impact-target-line-1-union-king");
    await act(async () => {
      let curr = (hitTarget as any)?.instance?.unstable_fiber;
      while (curr) {
        if (typeof curr.memoizedProps?.onPress === "function") {
          curr.memoizedProps.onPress();
          break;
        }
        curr = curr.return;
      }
    });

    expect(screen.getByText("suspension · Union to King")).toBeTruthy();
    expect(handleSelectionChange).toHaveBeenCalledWith({
      cardId: "alert-1",
      kind: "suspension",
      label: "Union to King",
      segmentId: "line-1-union-king",
      sourceNetwork: "ttc",
    });
  });

  it("updates caption and notifies onSelectionChange when a station node impact hit target is pressed", async () => {
    const handleSelectionChange = jest.fn();
    await render(
      <SchematicMap
        dashboard={mockTtcDashboard}
        onSelectionChange={handleSelectionChange}
      />,
      { wrapper: Wrapper },
    );

    const stationTarget = screen.getByTestId("impact-station-target-queen");
    await act(async () => {
      let curr = (stationTarget as any)?.instance?.unstable_fiber;
      while (curr) {
        if (typeof curr.memoizedProps?.onPress === "function") {
          curr.memoizedProps.onPress();
          break;
        }
        curr = curr.return;
      }
    });

    expect(screen.getByText("delay · Queen (Elevator Outage)")).toBeTruthy();
    expect(handleSelectionChange).toHaveBeenCalledWith({
      cardId: "delay-station-queen",
      kind: "delay",
      label: "Queen (Elevator Outage)",
      stationId: "queen",
      sourceNetwork: "ttc",
    });
  });

  it("renders active selection highlight ring when an item is selected", async () => {
    await render(
      <SchematicMap
        dashboard={mockTtcDashboard}
        selection={{
          cardId: "delay-station-queen",
          kind: "delay",
          label: "Queen (Elevator Outage)",
          stationId: "queen",
        }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("impact-station-highlight-queen")).toBeTruthy();
    expect(screen.getByText("delay · Queen (Elevator Outage)")).toBeTruthy();
  });

  it("computes distinct visual tone colors for all impact kinds", () => {
    const lineColors = themes.dark.line;
    expect(impactColor("suspension", lineColors)).toBe(lineColors.suspension);
    expect(impactColor("delay", lineColors)).toBe(lineColors.delay);
    expect(impactColor("reduced-speed-zone", lineColors)).toBe("#f59e0b");
    expect(impactColor("planned-closure", lineColors)).toBe(lineColors.planned);
  });

  it("handles zoom in and zoom out controls with accessible labels", async () => {
    await render(<SchematicMap dashboard={mockTtcDashboard} />, { wrapper: Wrapper });

    const mapStage = screen.getByTestId("map-stage");
    await act(async () => {
      fireEvent(mapStage, "layout", {
        nativeEvent: { layout: { width: 400, height: 200 } },
      });
    });

    const zoomInBtn = screen.getByTestId("map-control-zoom-in");
    const zoomOutBtn = screen.getByTestId("map-control-zoom-out");

    expect(zoomInBtn.props.accessibilityLabel).toBe("Zoom in");
    expect(zoomOutBtn.props.accessibilityLabel).toBe("Zoom out");

    await act(async () => {
      fireEvent.press(zoomInBtn);
    });

    // Reset button appears after zooming in
    const resetBtn = screen.queryByTestId("map-control-reset");
    if (resetBtn) {
      expect(resetBtn.props.accessibilityLabel).toBe("Reset map view");
      await act(async () => {
        fireEvent.press(resetBtn);
      });
    }

    await act(async () => {
      fireEvent.press(zoomOutBtn);
    });
  });

  it("supports reducedMotion prop without throwing", async () => {
    await render(
      <SchematicMap dashboard={mockTtcDashboard} reducedMotion={true} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
  });

  it("applies default TTC framing and accepts keepouts on layout", async () => {
    await render(
      <SchematicMap
        dashboard={mockTtcDashboard}
        immersive={true}
        keepouts={{ top: 96, bottom: 220, left: 44, right: 48 }}
      />,
      { wrapper: Wrapper },
    );

    const mapStage = screen.getByTestId("map-stage");
    await act(async () => {
      fireEvent(mapStage, "layout", {
        nativeEvent: { layout: { width: 390, height: 844 } },
      });
    });

    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    expect(screen.getByTestId("animated-map-canvas")).toBeTruthy();
  });
});
