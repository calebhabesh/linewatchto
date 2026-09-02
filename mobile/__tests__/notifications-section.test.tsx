import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { NotificationsSection } from "@/features/more/notifications-section";
import { AuthProvider } from "@/state/auth-provider";
import { PushNotificationsProvider } from "@/state/push-notifications-provider";
import { ThemeProvider } from "@/theme/theme-provider";

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
import * as pushApi from "@/api/push";
import { sessionTokenStore } from "@/storage/session-token";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PushNotificationsProvider>{children}</PushNotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

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

describe("NotificationsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
  });

  it("renders unauthenticated banner when user is not signed in", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });

    await render(<NotificationsSection />, { wrapper: Wrapper });

    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByTestId("notifications-unauthenticated-banner")).toBeTruthy();
  });

  it("renders notification switches and timing options when authenticated", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: { id: "user_1", email: "test@example.com", displayName: "Rider", demo: false, googleLinked: false },
    });
    (pushApi.fetchPushConfig as jest.MockedFunction<any>).mockResolvedValue(mockPushConfig);
    (pushApi.updatePushPreferences as jest.MockedFunction<any>).mockResolvedValue({
      ...mockPushConfig.preferences,
      plannedClosureFollowUp: "24h",
    });

    await render(<NotificationsSection />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("commute-notifications-switch")).toBeTruthy();
    });

    expect(screen.getByText("Commute Route Alerts")).toBeTruthy();
    expect(screen.getByTestId("planned-closure-notifications-switch")).toBeTruthy();
    expect(screen.getByTestId("event-type-switch-plannedClosures")).toBeTruthy();
    expect(screen.getByTestId("timing-policy-smart")).toBeTruthy();
    expect(screen.getByTestId("timing-policy-24h")).toBeTruthy();
    expect(screen.getByTestId("line-sub-line-1")).toBeTruthy();
    expect(screen.getByTestId("line-sub-line-2")).toBeTruthy();

    // Toggle 24h timing policy
    await act(async () => {
      fireEvent.press(screen.getByTestId("timing-policy-24h"));
    });

    expect(pushApi.updatePushPreferences).toHaveBeenCalledWith("test-token", {
      plannedClosureFollowUp: "24h",
    });
  });
});
