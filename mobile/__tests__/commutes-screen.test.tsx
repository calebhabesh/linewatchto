import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { CommutesScreen } from "@/features/commutes/commutes-screen";
import { AuthProvider } from "@/state/auth-provider";
import { CommutesProvider } from "@/state/commutes-provider";
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

jest.mock("@/api/commutes");

import * as authApi from "@/api/auth";
import * as commutesApi from "@/api/commutes";
import { sessionTokenStore } from "@/storage/session-token";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CommutesProvider>
          <NetworkProvider>{children}</NetworkProvider>
        </CommutesProvider>
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
      { id: "finch", name: "Finch", x: 4311, y: 1500, interchange: false },
      { id: "union", name: "Union", x: 4311, y: 3597, interchange: true },
      { id: "bloor-yonge", name: "Bloor-Yonge", x: 4546, y: 2602, interchange: true },
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

describe("CommutesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (useDashboard as jest.MockedFunction<any>).mockReturnValue({
      data: mockDashboard,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("renders unauthenticated card with sign in and demo login actions", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({ commutes: [] });

    await render(<CommutesScreen />, { wrapper: Wrapper });

    expect(screen.getByText("My Commutes")).toBeTruthy();
    expect(screen.getByTestId("commutes-unauthenticated-card")).toBeTruthy();
    expect(screen.getByText("Track Your Daily Commute")).toBeTruthy();
    expect(screen.getByTestId("commutes-demo-button")).toBeTruthy();
    expect(screen.getByTestId("commutes-signin-button")).toBeTruthy();

    // Tap sign in navigates to more
    fireEvent.press(screen.getByTestId("commutes-signin-button"));
    expect(router.push).toHaveBeenCalledWith("/more");
  });

  it("renders empty state and add commute button when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({ commutes: [] });

    await render(<CommutesScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("add-commute-button")).toBeTruthy();
    });

    expect(screen.getByText("No saved commutes for this network.")).toBeTruthy();
    expect(screen.getByText("0 commutes monitored")).toBeTruthy();
  });

  it("renders saved commute cards with travel times and matched impacts", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({
      commutes: [
        {
          id: "commute_456",
          label: "Morning Work Route",
          networkId: "ttc",
          originStationId: "finch",
          originStationName: "Finch",
          destinationStationId: "union",
          destinationStationName: "Union",
          routeLabel: "Line 1 Southbound",
          watchReturnTrip: true,
          path: {
            status: "available",
            stationIds: ["finch", "union"],
            segmentIds: ["seg-1"],
            estimatedTravelSeconds: 1500,
          },
          impact: {
            status: "impacted",
            severity: "delay",
            statusLabel: "Delay",
            matchedImpacts: [
              {
                id: "alert-1",
                kind: "delay",
                status: "active",
                severity: "delay",
                title: "Line 1 Signal Delay",
                description: "Trains moving slowly near Bloor-Yonge.",
                lineId: "line-1",
                lineNumber: "1",
              },
            ],
            travelTimeEstimate: {
              status: "estimated",
              baselineSeconds: 1500,
              summary: "+5–10 min delay",
            },
          },
          outboundLeg: {
            id: "leg-out",
            routeLabel: "Outbound",
            fromStationId: "finch",
            fromStationName: "Finch",
            toStationId: "union",
            toStationName: "Union",
            path: { status: "available", estimatedTravelSeconds: 1500 },
            impact: { status: "impacted", severity: "delay", statusLabel: "Delay" },
          },
          returnLeg: {
            id: "leg-ret",
            routeLabel: "Return",
            fromStationId: "union",
            fromStationName: "Union",
            toStationId: "finch",
            toStationName: "Finch",
            path: { status: "available", estimatedTravelSeconds: 1500 },
            impact: { status: "clear", severity: "normal", statusLabel: "Normal Service" },
          },
          createdAt: "2026-09-02T00:00:00Z",
          updatedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    await render(<CommutesScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("commute-card-commute_456")).toBeTruthy();
    });

    expect(screen.getByText("Morning Work Route")).toBeTruthy();
    expect(screen.getByText("Finch › Union")).toBeTruthy();
    expect(screen.getByText("25 min · +5–10 min delay")).toBeTruthy();
    expect(screen.getByText("Line 1 Signal Delay")).toBeTruthy();
    expect(screen.getByText("Trains moving slowly near Bloor-Yonge.")).toBeTruthy();
    expect(screen.getByTestId("delete-commute-commute_456")).toBeTruthy();
  });

  it("opens add commute modal and creates a commute", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({ commutes: [] });
    (commutesApi.createSavedCommute as jest.MockedFunction<any>).mockResolvedValue({
      id: "commute_created",
      label: "Bloor-Yonge to Union",
      networkId: "ttc",
      originStationId: "bloor-yonge",
      originStationName: "Bloor-Yonge",
      destinationStationId: "union",
      destinationStationName: "Union",
      routeLabel: "Line 1 Southbound",
      watchReturnTrip: true,
      createdAt: "2026-09-02T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z",
    });

    await render(<CommutesScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("add-commute-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("add-commute-button"));
    });

    await waitFor(() => {
      expect(screen.getByText("Add Commute Route")).toBeTruthy();
      expect(screen.getByTestId("picker-from-bloor-yonge")).toBeTruthy();
      expect(screen.getByTestId("picker-to-union")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-from-bloor-yonge"));
      fireEvent.press(screen.getByTestId("picker-to-union"));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("commute-submit-button"));
    });

    await waitFor(() => {
      expect(commutesApi.createSavedCommute).toHaveBeenCalledWith("test-token", {
        networkId: "ttc",
        fromStationId: "bloor-yonge",
        toStationId: "union",
        customLabel: undefined,
        includeReturnTrip: true,
      });
    });
  });
});
