import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import * as pushApi from "@/api/push";
import { AuthProvider } from "@/state/auth-provider";
import {
  PushNotificationsProvider,
  usePushNotifications,
} from "@/state/push-notifications-provider";
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

jest.mock("@/api/push");

import * as authApi from "@/api/auth";

const wrapper = ({ children }: PropsWithChildren) => (
  <AuthProvider>
    <PushNotificationsProvider>{children}</PushNotificationsProvider>
  </AuthProvider>
);

const mockPushConfig = {
  webPushAvailable: true,
  vapidPublicKey: "test-key",
  preferences: {
    commuteNotificationsEnabled: true,
    plannedClosureNotificationsEnabled: true,
    savedCommutes: {
      currentDisruptions: true,
      plannedClosureReminders: true,
      eventTypes: {
        suspensions: true,
        delays: true,
        tripCancellations: true,
        reducedSpeedZones: true,
        plannedClosures: true,
        serviceRestored: false,
      },
    },
    lineSubscriptions: {
      lines: [
        { lineId: "line-1", lineNumber: "1", label: "Yonge-University", subscribed: true },
        { lineId: "line-2", lineNumber: "2", label: "Bloor-Danforth", subscribed: false },
      ],
      eventTypes: {
        suspensions: true,
        delays: true,
        tripCancellations: true,
        reducedSpeedZones: true,
        plannedClosures: true,
        serviceRestored: false,
      },
    },
    reminderTiming: {
      onChange: true,
      closure24h: true,
      closureMorning: true,
    },
    plannedClosureFollowUp: "smart",
  },
  deviceSummary: {
    enabledDeviceCount: 1,
    hasEnabledDevices: true,
  },
};

describe("PushNotificationsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
  });

  it("initializes null when unauthenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });

    const { result } = await renderHook(() => usePushNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config).toBeNull();
    expect(result.current.preferences).toBeNull();
  });

  it("loads push config when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (pushApi.fetchPushConfig as jest.MockedFunction<any>).mockResolvedValue(mockPushConfig);

    const { result } = await renderHook(() => usePushNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.preferences).toBeTruthy();
    });

    expect(result.current.preferences?.commuteNotificationsEnabled).toBe(true);
    expect(result.current.preferences?.lineSubscriptions.lines[0]?.subscribed).toBe(true);
  });

  it("updates preferences and toggles line subscriptions", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (pushApi.fetchPushConfig as jest.MockedFunction<any>).mockResolvedValue(mockPushConfig);
    (pushApi.updatePushPreferences as jest.MockedFunction<any>).mockResolvedValue({
      ...mockPushConfig.preferences,
      commuteNotificationsEnabled: false,
    });

    const { result } = await renderHook(() => usePushNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.preferences).toBeTruthy();
    });

    await act(async () => {
      await result.current.toggleCommuteNotifications(false);
    });

    expect(pushApi.updatePushPreferences).toHaveBeenCalledWith("test-token", {
      commuteNotificationsEnabled: false,
    });
  });
});
