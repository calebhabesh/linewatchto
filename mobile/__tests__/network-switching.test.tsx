import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";

import { mockRegionalDashboard, mockTtcDashboard } from "./fixtures/mock-dashboards";

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

describe("Network Switching & Storage Persistence", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (useDashboard as unknown as jest.Mock).mockImplementation((network: any) => {
      if (network === "regional") {
        return {
          data: mockRegionalDashboard,
          isPending: false,
          isError: false,
          error: null,
          dataUpdatedAt: Date.now(),
          isRefetching: false,
          isStale: false,
          refetch: jest.fn(),
        };
      }
      return {
        data: mockTtcDashboard,
        isPending: false,
        isError: false,
        error: null,
        dataUpdatedAt: Date.now(),
        isRefetching: false,
        isStale: false,
        refetch: jest.fn(),
      };
    });
  });

  it("switches network from TTC to Regional and persists choice to AsyncStorage", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    // Initial TTC state
    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    expect(screen.getByTestId("map-line-line-1")).toBeTruthy();

    // Switch to Regional
    const regionalTab = screen.getByTestId("network-regional");
    await act(async () => {
      fireEvent.press(regionalTab);
    });

    // Verify regional dashboard data rendered
    await waitFor(() => {
      expect(screen.getByTestId("schematic-map-regional")).toBeTruthy();
      expect(screen.getByTestId("map-line-regional-lw")).toBeTruthy();
      expect(screen.getByTestId("map-line-regional-up")).toBeTruthy();
    });

    // Verify AsyncStorage write
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("linewatch.network-id", "regional");
  });

  it("switches back from Regional to TTC and restores subway lines and map", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    // Switch to Regional first
    await act(async () => {
      fireEvent.press(screen.getByTestId("network-regional"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("map-line-regional-lw")).toBeTruthy();
    });

    // Switch back to TTC
    await act(async () => {
      fireEvent.press(screen.getByTestId("network-ttc"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
      expect(screen.getByTestId("map-line-line-1")).toBeTruthy();
      expect(screen.getByTestId("map-line-line-2")).toBeTruthy();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("linewatch.network-id", "ttc");
  });

  it("hydrates initial network from AsyncStorage when previously saved as regional", async () => {
    await AsyncStorage.setItem("linewatch.network-id", "regional");

    await render(<DashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("schematic-map-regional")).toBeTruthy();
      expect(screen.getByTestId("map-line-regional-lw")).toBeTruthy();
    });
  });
});
