import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { StationsScreen } from "@/features/stations/stations-screen";
import { AuthProvider } from "@/state/auth-provider";
import { NetworkProvider } from "@/state/network-provider";
import { SavedStationsProvider } from "@/state/saved-stations-provider";
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

jest.mock("@/storage/session-token", () => ({
  sessionTokenStore: {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock("@/api/auth", () => ({
  fetchAuthConfig: jest.fn(),
  fetchCurrentUser: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  demoLogin: jest.fn(),
  devLogin: jest.fn(),
  logout: jest.fn(),
}));

jest.mock("@/api/saved-stations");

import * as authApi from "@/api/auth";
import * as savedStationsApi from "@/api/saved-stations";
import { sessionTokenStore } from "@/storage/session-token";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SavedStationsProvider>
          <NetworkProvider>{children}</NetworkProvider>
        </SavedStationsProvider>
      </AuthProvider>
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
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({ stations: [] });
    (useDashboard as jest.MockedFunction<any>).mockReturnValue({
      data: mockDashboard,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("renders station list and allows searching, clearing, and navigating to station details", async () => {
    await render(<StationsScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Stations")).toBeTruthy();
    expect(screen.getByText("3 stations mapped")).toBeTruthy();
    expect(screen.getByText("Union")).toBeTruthy();
    expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
    expect(screen.getByText("Spadina")).toBeTruthy();

    // Filter stations by search term
    const searchInput = screen.getByLabelText("Search stations");
    fireEvent.changeText(searchInput, "Bloor");

    await waitFor(() => {
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.queryByText("Union")).toBeNull();
      expect(screen.getByText("1 station matching")).toBeTruthy();
    });

    // Clear search with clear button
    const clearButton = screen.getByTestId("clear-station-search");
    fireEvent.press(clearButton);

    await waitFor(() => {
      expect(screen.getByText("Union")).toBeTruthy();
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.getByText("3 stations mapped")).toBeTruthy();
    });

    // Tap station row to navigate
    fireEvent.press(screen.getByText("Bloor-Yonge"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/station/[network]/[id]",
      params: { network: "ttc", id: "bloor-yonge" },
    });
  });

  it("filters stations by line filter chip", async () => {
    await render(<StationsScreen />, { wrapper: Wrapper });

    // Line 2 contains bloor-yonge and spadina, but not union (Line 1 only)
    const line2Filter = screen.getByTestId("line-filter-line-2");
    fireEvent.press(line2Filter);

    await waitFor(() => {
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.getByText("Spadina")).toBeTruthy();
      expect(screen.queryByText("Union")).toBeNull();
      expect(screen.getByText("2 stations matching")).toBeTruthy();
    });
  });

  it("filters stations by saved filter chip", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({
      stations: [
        {
          networkId: "ttc",
          station: { id: "bloor-yonge", name: "Bloor-Yonge", mapX: 4546, y: 2602, interchange: true },
          savedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    await render(<StationsScreen />, { wrapper: Wrapper });

    const savedFilter = screen.getByTestId("line-filter-saved");
    fireEvent.press(savedFilter);

    await waitFor(() => {
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.queryByText("Union")).toBeNull();
      expect(screen.queryByText("Spadina")).toBeNull();
      expect(screen.getByText("1 station matching")).toBeTruthy();
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
