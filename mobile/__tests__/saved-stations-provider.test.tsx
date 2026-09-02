import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert } from "react-native";

import * as savedStationsApi from "@/api/saved-stations";
import { AuthProvider } from "@/state/auth-provider";
import { SavedStationsProvider, useSavedStations } from "@/state/saved-stations-provider";
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

jest.mock("@/api/saved-stations");

import * as authApi from "@/api/auth";

const wrapper = ({ children }: PropsWithChildren) => (
  <AuthProvider>
    <SavedStationsProvider>{children}</SavedStationsProvider>
  </AuthProvider>
);

describe("SavedStationsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
  });

  it("initializes empty when unauthenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });

    const { result } = await renderHook(() => useSavedStations(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.savedStations).toEqual([]);
    expect(result.current.isSaved("bloor-yonge", "ttc")).toBe(false);
  });

  it("loads saved stations on startup when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({
      stations: [
        {
          networkId: "ttc",
          station: { id: "bloor-yonge", name: "Bloor-Yonge", mapX: 100, mapY: 200, interchange: true },
          savedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    const { result } = await renderHook(() => useSavedStations(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSaved("bloor-yonge", "ttc")).toBe(true);
    });

    expect(result.current.savedStations).toHaveLength(1);
    expect(result.current.isSaved("union", "ttc")).toBe(false);
  });

  it("prompts sign in when saving while unauthenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    const alertSpy = jest.spyOn(Alert, "alert");

    const { result } = await renderHook(() => useSavedStations(), { wrapper });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.toggleSaved("bloor-yonge", "ttc");
    });

    expect(outcome).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      "Sign In Required",
      expect.stringContaining("Sign in or try a demo account"),
    );
  });

  it("toggles saving and deleting station when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (savedStationsApi.fetchSavedStations as jest.MockedFunction<any>).mockResolvedValue({
      stations: [],
    });
    (savedStationsApi.saveStation as jest.MockedFunction<any>).mockResolvedValue({
      networkId: "ttc",
      station: { id: "st-clair", name: "St Clair", mapX: 100, mapY: 300, interchange: false },
      savedAt: "2026-09-02T00:00:00Z",
    });
    (savedStationsApi.deleteSavedStation as jest.MockedFunction<any>).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useSavedStations(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSaved("st-clair", "ttc")).toBe(false);
    });

    // Save
    await act(async () => {
      const saved = await result.current.toggleSaved("st-clair", "ttc");
      expect(saved).toBe(true);
    });

    expect(result.current.isSaved("st-clair", "ttc")).toBe(true);
    expect(savedStationsApi.saveStation).toHaveBeenCalledWith("test-token", "st-clair", "ttc");

    // Remove
    await act(async () => {
      const saved = await result.current.toggleSaved("st-clair", "ttc");
      expect(saved).toBe(false);
    });

    expect(result.current.isSaved("st-clair", "ttc")).toBe(false);
    expect(savedStationsApi.deleteSavedStation).toHaveBeenCalledWith("test-token", "st-clair", "ttc");
  });
});
