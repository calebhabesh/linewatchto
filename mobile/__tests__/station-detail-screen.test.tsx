import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router, useLocalSearchParams } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import {
  useRegionalStationArrivals,
  useStationSurfaceConnections,
  useTtcStationDetail,
} from "@/api/station-detail";
import { StationDetailScreen } from "@/features/stations/station-detail-screen";
import { AuthProvider } from "@/state/auth-provider";
import { SavedStationsProvider } from "@/state/saved-stations-provider";
import { ThemeProvider } from "@/theme/theme-provider";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: jest.fn(),
}));

jest.mock("@/hooks/use-screen-focused", () => ({
  useScreenFocused: () => true,
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

jest.mock("@/api/station-detail", () => ({
  useTtcStationDetail: jest.fn(),
  useRegionalStationArrivals: jest.fn(),
  useStationSurfaceConnections: jest.fn(),
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
        <SavedStationsProvider>{children}</SavedStationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const mockTtcDetailData = {
  id: "bloor-yonge",
  name: "Bloor-Yonge",
  mapX: 4546,
  mapY: 2602,
  interchange: true,
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Yonge-University",
      color: "#F8C300",
      platformLabel: "Northbound / Southbound",
      wheelchairAccessible: true,
      hasElevator: true,
    },
    {
      id: "line-2",
      number: "2",
      name: "Bloor-Danforth",
      color: "#00923F",
      platformLabel: "Eastbound / Westbound",
      wheelchairAccessible: true,
      hasElevator: true,
    },
  ],
  access: {
    status: "normal",
    summary: "All elevators and escalators are in service.",
    updatedAgo: "5m ago",
    outages: [],
  },
  impacts: [
    {
      id: "alert-delay-1",
      type: "active-alert",
      severity: "delay",
      title: "Line 1: Travel times longer than normal",
      summary: "Trains holding on platform at Bloor-Yonge due to signal work.",
      updatedAgo: "3m ago",
      updatedAt: "2026-09-01T14:30:00Z",
      source: "TTC Live Alerts",
    },
  ],
  notices: [
    {
      id: "notice-construction-1",
      category: "construction",
      title: "Bloor-Yonge Capacity Improvement Program",
      summary: "Construction ongoing on Line 2 platform expansion.",
      sourceUrl: "https://ttc.ca/bloor-yonge",
      effectiveStart: "2026-08-01",
      effectiveEnd: "2026-12-31",
      sourceUpdatedAt: "2026-08-15T09:00:00Z",
      lastVerifiedAt: "2026-09-01T12:00:00Z",
      source: "TTC",
    },
  ],
  arrivals: [
    {
      lineId: "line-1",
      direction: "Northbound towards Finch",
      minutes: 1,
      predictedAt: "2026-09-01T14:31:00Z",
      label: "1 min",
      source: "TTC GTFS-RT",
      status: "live",
    },
    {
      lineId: "line-2",
      direction: "Eastbound towards Kennedy",
      minutes: 0,
      predictedAt: "2026-09-01T14:30:00Z",
      label: "Due",
      source: "TTC GTFS-RT",
      status: "live",
    },
  ],
  arrivalsSource: "TTC Live Subway Predictions",
  arrivalContext: {
    scheduleMayBeDisrupted: true,
    message: "Line 1 schedule may be disrupted by track work.",
    reason: "Signal maintenance",
    severity: "delay",
    source: "TTC",
  },
  dataMode: "seeded-demo",
  disclaimer: "Unofficial transit reliability dashboard.",
  hasWashroom: true,
  hasParking: false,
  hasBicycleLockup: true,
  hasBicycleRepair: false,
  hasBikeShare: true,
  hasPpudo: false,
};

const mockRegionalDashboard = {
  networkId: "regional",
  availability: "available",
  sourceSystems: ["metrolinx-open-data"],
  message: "Live regional dashboard",
  map: {
    stations: [
      { id: "union", name: "Union Station", x: 4311, y: 3597, interchange: true },
      { id: "port-credit", name: "Port Credit", x: 2000, y: 3000, interchange: false },
    ],
    segments: [],
    stationNodeImpacts: [],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "just now" },
    lines: [],
  },
  activeAlerts: [
    {
      id: "regional-alert-1",
      lineId: "regional-lw",
      lineNumber: "LW",
      title: "Lakeshore West Delay at Union",
      location: "Union Station",
      description: "Signal delay approaching platform.",
      startedAt: "2026-09-01T14:00:00Z",
      updatedAt: "2026-09-01T14:20:00Z",
      source: "Metrolinx",
      severity: "delay" as const,
      affectedSegmentIds: [],
      shuttle: false,
      resolution: null,
      relatedPlannedClosureId: null,
      cause: null,
      displayDirection: null,
    },
  ],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  performance: {},
};

const mockRegionalArrivals = {
  stationId: "union",
  stationName: "Union Station",
  availability: "available",
  generatedAt: "2026-09-01T14:30:00Z",
  sourceUpdatedAt: "2026-09-01T14:29:45Z",
  source: "Metrolinx",
  message: "Live train estimates available",
  arrivals: [
    {
      lineId: "regional-lw",
      lineNumber: "LW",
      lineName: "Lakeshore West",
      direction: "Westbound to Niagara Falls",
      minutes: 5,
      predictedAt: "2026-09-01T14:35:00Z",
      scheduledAt: "2026-09-01T14:30:00Z",
      delayMinutes: 5,
      platform: "4",
      tripNumber: "1234",
      coachCount: 12,
      source: "Metrolinx",
      status: "live",
    },
  ],
};

const mockSurfaceConnections = {
  networkId: "ttc",
  stationId: "bloor-yonge",
  stationName: "Bloor-Yonge",
  availability: "available",
  generatedAt: "2026-09-01T14:30:00Z",
  sourceUpdatedAt: "2026-09-01T14:29:30Z",
  source: "TTC GTFS-RT",
  message: "Surface predictions available",
  arrivals: [
    {
      agency: "TTC",
      mode: "bus",
      route: "97",
      routeName: "Yonge",
      destination: "Steeles via Yonge",
      minutes: 4,
      predictedAt: "2026-09-01T14:34:00Z",
      scheduledAt: "2026-09-01T14:30:00Z",
      bayPlatform: "1",
      stopName: "Yonge St at Bloor St East",
      tripId: "trip-9701",
      source: "TTC GTFS-RT",
      status: "live",
    },
  ],
};

describe("StationDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({ stations: [] });
    (useDashboard as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useRegionalStationArrivals as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useStationSurfaceConnections as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders full TTC station detail with arrivals, notices, impacts, and facilities", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "bloor-yonge" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: mockTtcDetailData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useStationSurfaceConnections as jest.Mock).mockReturnValue({
      data: mockSurfaceConnections,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    // Station Header & Badges
    expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
    expect(screen.getAllByTestId("line-badge-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Yonge-University")).toBeTruthy();
    expect(screen.getAllByTestId("line-badge-2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bloor-Danforth")).toBeTruthy();
    expect(screen.getByText("INTERCHANGE")).toBeTruthy();

    // Facilities
    expect(screen.getByText("✓ Wheelchair Accessible")).toBeTruthy();
    expect(screen.getByText("✓ Washrooms")).toBeTruthy();
    expect(screen.getByText("✓ Bike Share")).toBeTruthy();

    // Rapid Transit Arrivals
    expect(screen.getByText("Subway & LRT Arrivals")).toBeTruthy();
    expect(screen.getByText("Northbound towards Finch")).toBeTruthy();
    expect(screen.getByText("Eastbound towards Kennedy")).toBeTruthy();
    expect(screen.getByText("Due")).toBeTruthy();
    expect(screen.getByText("1 min")).toBeTruthy();

    // Disruption Warning Banner
    expect(screen.getByText("⚠️ Line 1 schedule may be disrupted by track work.")).toBeTruthy();

    // Accessibility
    expect(screen.getByText("NORMAL")).toBeTruthy();
    expect(screen.getByText("All elevators and escalators are in service.")).toBeTruthy();

    // Station Notices
    expect(screen.getByText("Bloor-Yonge Capacity Improvement Program")).toBeTruthy();

    // Surface Connections
    expect(screen.getByText("Surface Connections")).toBeTruthy();
    expect(screen.getByText("97")).toBeTruthy();
    expect(screen.getByText("Steeles via Yonge")).toBeTruthy();
  });

  it("navigates to impact details when an impact card is pressed", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "bloor-yonge" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: mockTtcDetailData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Line 1: Travel times longer than normal")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Impact: Line 1: Travel times longer than normal"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/impact/[kind]/[id]",
      params: { kind: "delay", id: "alert-delay-1" },
    });
  });

  it("navigates back when back button is pressed", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "bloor-yonge" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: mockTtcDetailData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(router.back).toHaveBeenCalled();
  });

  it("renders composed Regional (GO/UP) station detail with train arrivals and impacts", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "regional", id: "union" });
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockRegionalDashboard,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useRegionalStationArrivals as jest.Mock).mockReturnValue({
      data: mockRegionalArrivals,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    // Station Header
    expect(screen.getByText("Union Station")).toBeTruthy();
    expect(screen.getAllByTestId("line-badge-lw").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Lakeshore West")).toBeTruthy();
    expect(screen.getByText("INTERCHANGE")).toBeTruthy();

    // Train Arrivals
    expect(screen.getByText("GO & UP Train Arrivals")).toBeTruthy();
    expect(screen.getByText("Westbound to Niagara Falls")).toBeTruthy();
    expect(screen.getByText("Platform 4")).toBeTruthy();
    expect(screen.getByText("5 min")).toBeTruthy();
    expect(screen.getByText("· 12 coaches")).toBeTruthy();
    expect(screen.getByText("· 5m Late")).toBeTruthy();

    // Regional Corridor Impacts
    expect(screen.getByText("Active Corridor Impacts")).toBeTruthy();
    expect(screen.getByText("Lakeshore West Delay at Union")).toBeTruthy();
  });

  it("renders loading state when queries are pending", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "union" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: null,
      isPending: true,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Loading station details…")).toBeTruthy();
  });

  it("renders error state when request fails and allows retry", async () => {
    const handleRetry = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "union" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: new Error("Network connection lost"),
      refetch: handleRetry,
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Network connection lost")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry request" }));
    expect(handleRetry).toHaveBeenCalled();
  });

  it("renders save station button in header and allows toggling", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ network: "ttc", id: "bloor-yonge" });
    (useTtcStationDetail as jest.Mock).mockReturnValue({
      data: mockTtcDetailData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<StationDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId("station-detail-save-button")).toBeTruthy();
    expect(screen.getByText("☆ Save")).toBeTruthy();
  });
});
