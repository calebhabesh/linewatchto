import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { StationsScreen } from "@/features/stations/stations-screen";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>{children}</NetworkProvider>
    </ThemeProvider>
  );
}

const mockDashboard = {
  networkId: "ttc",
  availability: "available",
  sourceSystems: ["ttc-live-alerts"],
  message: "Live dashboard",
  map: {
    stations: [
      { id: "union", name: "Union", x: 4311, y: 3597, interchange: true },
      { id: "bloor-yonge", name: "Bloor-Yonge", x: 4546, y: 2602, interchange: true },
      { id: "spadina", name: "Spadina", x: 3740, y: 2564, interchange: true },
    ],
    segments: [],
    stationNodeImpacts: [],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "just now" },
    lines: [],
  },
  activeAlerts: [],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  performance: {},
};

describe("StationsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockDashboard,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("renders station list and allows searching and navigating to station details", async () => {
    await render(<StationsScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Stations")).toBeTruthy();
    expect(screen.getByText("Union")).toBeTruthy();
    expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
    expect(screen.getByText("Spadina")).toBeTruthy();

    // Filter stations by search term
    const searchInput = screen.getByLabelText("Search stations");
    fireEvent.changeText(searchInput, "Bloor");

    await waitFor(() => {
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.queryByText("Union")).toBeNull();
    });

    // Tap station row to navigate
    fireEvent.press(screen.getByText("Bloor-Yonge"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/station/[network]/[id]",
      params: { network: "ttc", id: "bloor-yonge" },
    });
  });

  it("shows empty state when search produces no matching station", async () => {
    await render(<StationsScreen />, { wrapper: Wrapper });

    const searchInput = screen.getByLabelText("Search stations");
    fireEvent.changeText(searchInput, "NonexistentStation");

    await waitFor(() => {
      expect(screen.getByText("No matching mapped stations.")).toBeTruthy();
    });
  });
});
