import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";

import {
  mockCleanDashboard,
  mockNonLiveDashboard,
  mockRegionalDashboard,
  mockTtcDashboard,
} from "./fixtures/mock-dashboards";

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

describe("DashboardScreen Component Rendering & State Transitions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial TTC Dashboard Rendering", () => {
    beforeEach(() => {
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

    it("renders the immersive product chrome and status peek", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByTestId("map-top-chrome")).toBeTruthy();
      expect(screen.getByTestId("map-line-rail")).toBeTruthy();
      expect(screen.getByTestId("map-status-peek")).toBeTruthy();
      expect(screen.getByTestId("center-map-button")).toBeTruthy();
      expect(screen.getByText("3 Current Impacts")).toBeTruthy();
    });

    it("renders all 4 TTC subway/LRT lines in the accessible map rail", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByTestId("map-line-line-1").props.accessibilityLabel).toContain("Yonge-University: Suspension");
      expect(screen.getByTestId("map-line-line-2").props.accessibilityLabel).toContain("Bloor-Danforth: Delays");
      expect(screen.getByTestId("map-line-line-4").props.accessibilityLabel).toContain("Sheppard: Good Service");
      expect(screen.getByTestId("map-line-line-6").props.accessibilityLabel).toContain("Finch West: Planned Closure");
    });

    it("renders the schematic map for TTC network", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });
      expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    });

    it("summarizes each impact class without duplicating Status cards over the map", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText(/Active Alert/)).toBeTruthy();
      expect(screen.getByText(/Delay/)).toBeTruthy();
      expect(screen.getByText(/Reduced Speed Zone/)).toBeTruthy();
      expect(screen.getByText(/Planned Closure/)).toBeTruthy();
      expect(screen.queryByText("Line 1 Suspension")).toBeNull();
    });
  });

  describe("Initial Regional (GO & UP) Dashboard Rendering", () => {
    beforeEach(() => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockRegionalDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.parse("2026-09-01T13:41:00Z"),
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      });
    });

    it("renders all 8 regional rail corridors in the map rail", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });

      for (const line of mockRegionalDashboard.status.lines) {
        expect(screen.getByTestId(`map-line-${line.id}`).props.accessibilityLabel).toContain(line.name);
      }
    });

    it("renders regional schematic map and summarizes impacts without an RSZ chip", async () => {
      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByTestId("schematic-map-regional")).toBeTruthy();
      expect(screen.queryByText(/Reduced Speed Zone/)).toBeNull();
      expect(screen.getByText("2 Current Impacts")).toBeTruthy();
    });
  });

  describe("Data State Banner: Live, Non-Live, Cached, and Stale States", () => {
    it("renders fresh source data banner when live: true and query is fresh", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockTtcDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.now(),
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Fresh source data")).toBeTruthy();
    });

    it("renders source is not live banner when live: false in demo/scheduled mode", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockNonLiveDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.now(),
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Source is not live")).toBeTruthy();
    });

    it("renders cached data banner with refresh failure note when background refetch errors", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockTtcDashboard,
        isPending: false,
        isError: true,
        error: new Error("Network timeout"),
        dataUpdatedAt: Date.parse("2026-09-01T13:41:00Z"),
        isRefetching: false,
        isStale: true,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Showing cached data")).toBeTruthy();
      expect(screen.getByText(/Refresh failed ·/)).toBeTruthy();
    });

    it("renders cached data banner with refresh pending note when query is stale without error", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockTtcDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.parse("2026-09-01T13:41:00Z"),
        isRefetching: false,
        isStale: true,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Showing cached data")).toBeTruthy();
      expect(screen.getByText(/Refresh pending ·/)).toBeTruthy();
    });
  });

  describe("Empty Impacts & Closures", () => {
    it("renders clean empty states when there are no active impacts or planned closures", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: mockCleanDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.now(),
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("No Current Impacts")).toBeTruthy();
      expect(screen.getByText("No dashboard-visible disruptions")).toBeTruthy();
    });
  });

  describe("Loading & Error States", () => {
    it("renders loading state when query is pending without cached data", async () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: null,
        isPending: true,
        isError: false,
        error: null,
        dataUpdatedAt: 0,
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Loading service map…")).toBeTruthy();
      expect(screen.getByRole("progressbar")).toBeTruthy();
    });

    it("renders error state when query fails without cached data and allows retry", async () => {
      const handleRetry = jest.fn();
      (useDashboard as jest.Mock).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: new Error("503 Service Unavailable"),
        dataUpdatedAt: 0,
        isRefetching: false,
        isStale: false,
        refetch: handleRetry,
      });

      await render(<DashboardScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Service data unavailable")).toBeTruthy();
      expect(screen.getByText("503 Service Unavailable")).toBeTruthy();

      const retryButton = screen.getByRole("button", { name: "Retry request" });
      fireEvent.press(retryButton);
      expect(handleRetry).toHaveBeenCalled();
    });
  });
});
