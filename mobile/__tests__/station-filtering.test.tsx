import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { StationsScreen } from "@/features/stations/stations-screen";
import { AuthProvider } from "@/state/auth-provider";
import { NetworkProvider } from "@/state/network-provider";
import { SavedStationsProvider } from "@/state/saved-stations-provider";
import { ThemeProvider } from "@/theme/theme-provider";

import { mockRegionalDashboard, mockTtcDashboard } from "./fixtures/mock-dashboards";

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

describe("StationsScreen Filtering, Search, and Interchange Badges", () => {
  const handleRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({ stations: [] });
    (useDashboard as unknown as jest.Mock).mockImplementation((network: any) => {
      if (network === "regional") {
        return {
          data: mockRegionalDashboard,
          isPending: false,
          isRefetching: false,
          error: null,
          refetch: handleRefetch,
        };
      }
      return {
        data: mockTtcDashboard,
        isPending: false,
        isRefetching: false,
        error: null,
        refetch: handleRefetch,
      };
    });
  });

  describe("TTC Mode Station Search", () => {
    it("renders all mapped TTC stations initially with interchange labels", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      expect(screen.getByText("Stations")).toBeTruthy();
      expect(screen.getByText("Union")).toBeTruthy();
      expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
      expect(screen.getByText("Queen")).toBeTruthy();

      // Interchange badges
      const interchangeBadges = screen.getAllByText("INTERCHANGE");
      expect(interchangeBadges.length).toBeGreaterThan(0);
    });

    it("filters stations by partial name case-insensitively", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      const searchInput = screen.getByLabelText("Search stations");
      await act(async () => {
        fireEvent.changeText(searchInput, "bloor");
      });

      await waitFor(() => {
        expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
        expect(screen.queryByText("Union")).toBeNull();
        expect(screen.queryByText("Queen")).toBeNull();
      });
    });

    it("filters stations with uppercase and mixed-case query", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      const searchInput = screen.getByLabelText("Search stations");
      await act(async () => {
        fireEvent.changeText(searchInput, "SPADINA");
      });

      await waitFor(() => {
        expect(screen.getByText("Spadina")).toBeTruthy();
        expect(screen.queryByText("Bloor-Yonge")).toBeNull();
      });
    });

    it("shows empty state when no station matches search criteria", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      const searchInput = screen.getByLabelText("Search stations");
      await act(async () => {
        fireEvent.changeText(searchInput, "NonexistentStation");
      });

      await waitFor(() => {
        expect(screen.getByText("No matching mapped stations.")).toBeTruthy();
        expect(screen.getByText('No mapped stations matched "NonexistentStation".')).toBeTruthy();
      });
    });

    it("navigates to TTC station details route on station press", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      const stationRow = screen.getByText("Bloor-Yonge");
      fireEvent.press(stationRow);

      expect(router.push).toHaveBeenCalledWith({
        pathname: "/station/[network]/[id]",
        params: { network: "ttc", id: "bloor-yonge" },
      });
    });
  });

  describe("Regional Mode Station Search", () => {
    it("switches to Regional network and searches GO & UP stations", async () => {
      await render(<StationsScreen />, { wrapper: Wrapper });

      // Switch to regional mode
      await act(async () => {
        fireEvent.press(screen.getByTestId("network-regional"));
      });

      await waitFor(() => {
        expect(screen.getByText("Port Credit")).toBeTruthy();
        expect(screen.getByText("Pearson Airport")).toBeTruthy();
      });

      // Filter regional stations
      const searchInput = screen.getByLabelText("Search stations");
      await act(async () => {
        fireEvent.changeText(searchInput, "Pearson");
      });

      await waitFor(() => {
        expect(screen.getByText("Pearson Airport")).toBeTruthy();
        expect(screen.queryByText("Port Credit")).toBeNull();
      });

      // Navigate to regional station
      fireEvent.press(screen.getByText("Pearson Airport"));

      expect(router.push).toHaveBeenCalledWith({
        pathname: "/station/[network]/[id]",
        params: { network: "regional", id: "pearson-airport" },
      });
    });
  });
});
