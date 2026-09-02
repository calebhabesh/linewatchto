import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import * as commutesApi from "@/api/commutes";
import { AuthProvider } from "@/state/auth-provider";
import { CommutesProvider, useCommutes } from "@/state/commutes-provider";
import { sessionTokenStore } from "@/storage/session-token";

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

const wrapper = ({ children }: PropsWithChildren) => (
  <AuthProvider>
    <CommutesProvider>{children}</CommutesProvider>
  </AuthProvider>
);

describe("CommutesProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
  });

  it("initializes empty when unauthenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });

    const { result } = await renderHook(() => useCommutes(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.commutes).toEqual([]);
  });

  it("loads saved commutes on startup when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({
      commutes: [
        {
          id: "commute_123",
          label: "Office Commute",
          networkId: "ttc",
          originStationId: "finch",
          originStationName: "Finch",
          destinationStationId: "union",
          destinationStationName: "Union",
          routeLabel: "Line 1 Southbound",
          watchReturnTrip: true,
          createdAt: "2026-09-02T00:00:00Z",
          updatedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    const { result } = await renderHook(() => useCommutes(), { wrapper });

    await waitFor(() => {
      expect(result.current.commutes).toHaveLength(1);
    });

    expect(result.current.commutes[0]?.label).toBe("Office Commute");
  });

  it("creates and deletes saved commutes", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (commutesApi.fetchSavedCommutes as jest.MockedFunction<any>).mockResolvedValue({
      commutes: [],
    });
    (commutesApi.createSavedCommute as jest.MockedFunction<any>).mockResolvedValue({
      id: "commute_new",
      label: "Campus",
      networkId: "ttc",
      originStationId: "st-george",
      originStationName: "St George",
      destinationStationId: "queen",
      destinationStationName: "Queen",
      routeLabel: "Line 1 Southbound",
      watchReturnTrip: false,
      createdAt: "2026-09-02T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z",
    });
    (commutesApi.deleteSavedCommute as jest.MockedFunction<any>).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useCommutes(), { wrapper });

    await waitFor(() => {
      expect(result.current.commutes).toHaveLength(0);
    });

    // Create commute
    await act(async () => {
      await result.current.createCommute({
        networkId: "ttc",
        fromStationId: "st-george",
        toStationId: "queen",
        customLabel: "Campus",
        includeReturnTrip: false,
      });
    });

    expect(result.current.commutes).toHaveLength(1);
    expect(result.current.commutes[0]?.id).toBe("commute_new");
    expect(commutesApi.createSavedCommute).toHaveBeenCalledWith("test-token", {
      networkId: "ttc",
      fromStationId: "st-george",
      toStationId: "queen",
      customLabel: "Campus",
      includeReturnTrip: false,
    });

    // Delete commute
    await act(async () => {
      await result.current.deleteCommute("commute_new");
    });

    expect(result.current.commutes).toHaveLength(0);
    expect(commutesApi.deleteSavedCommute).toHaveBeenCalledWith("test-token", "commute_new");
  });
});
