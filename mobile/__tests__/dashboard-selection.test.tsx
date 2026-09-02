import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import React, { type PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  },
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

jest.mock("@/api/trains", () => ({
  useEstimatedTrains: jest.fn(() => ({
    data: { fresh: true, markers: [] },
    isPending: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
  })),
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

describe("DashboardScreen Card-to-Map and Map-to-Card Selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
      isPending: false,
      isError: false,
      error: null,
      dataUpdatedAt: Date.parse("2026-09-01T13:41:00Z"),
      isRefetching: false,
      isStale: false,
      refetch: jest.fn(),
    });
  });

  it("renders the map-first dashboard without duplicating Status cards", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    expect(screen.getByTestId("map-status-peek")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-alert-card-alert-suspension-1")).toBeNull();
    expect(screen.queryByText("SELECTED")).toBeNull();
  });

  it("selecting an impact segment on the map renders the SelectedImpactPreview card", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    const segmentHitTarget = screen.getByTestId("impact-target-line-1-union-king");

    let curr = (segmentHitTarget as any)?.instance?.unstable_fiber;
    while (curr) {
      if (typeof curr.memoizedProps?.onPress === "function") {
        await act(async () => {
          curr.memoizedProps.onPress();
        });
        break;
      }
      curr = curr.return;
    }

    // Selected Impact Preview Card should be visible with rich metadata
    expect(screen.getByTestId("selected-impact-preview")).toBeTruthy();
    expect(screen.getByText("Line 1 Suspension")).toBeTruthy();
    expect(screen.getByText("Union to King")).toBeTruthy();
    expect(screen.getByText("ACTIVE ALERT")).toBeTruthy();

    expect(screen.getByTestId("impact-highlight-line-1-union-king")).toBeTruthy();
    fireEvent.press(screen.getByTestId("view-impact-details"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/impact/[kind]/[id]",
      params: { kind: "suspension", id: "alert-suspension-1" },
    });
  });

  it("selecting a station node ring on the map updates the preview card", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    const stationHitTarget = screen.getByTestId("impact-station-target-queen");

    let curr = (stationHitTarget as any)?.instance?.unstable_fiber;
    while (curr) {
      if (typeof curr.memoizedProps?.onPress === "function") {
        await act(async () => {
          curr.memoizedProps.onPress();
        });
        break;
      }
      curr = curr.return;
    }

    // Preview should update for station impact
    expect(screen.getByTestId("selected-impact-preview")).toBeTruthy();
    expect(screen.getByText("Queen Elevator Outage")).toBeTruthy();
    expect(screen.getByText("Queen Station")).toBeTruthy();

    expect(screen.getByTestId("impact-station-highlight-queen")).toBeTruthy();
  });

  it("opens the dedicated Status tab from the impact peek", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId("open-status-button"));

    expect(router.push).toHaveBeenCalledWith("/(tabs)/alerts");
  });
});
