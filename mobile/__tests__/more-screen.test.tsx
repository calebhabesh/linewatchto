import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Linking } from "react-native";
import type { PropsWithChildren } from "react";

import { MoreScreen } from "@/features/more/more-screen";
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

jest.mock("@/api/push", () => ({
  fetchPushConfig: jest.fn(),
  updatePushPreferences: jest.fn(),
}));

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

describe("MoreScreen Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (pushApi.fetchPushConfig as jest.MockedFunction<any>).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders about sections, data source info, and unofficial disclaimers", async () => {
    await render(<MoreScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Display")).toBeTruthy();
    expect(screen.getByText("Unofficial Independent Project")).toBeTruthy();
    expect(screen.getByText("Data Sources & Ingestion")).toBeTruthy();
    expect(screen.getByText("Derivative Map Acknowledgements")).toBeTruthy();
    expect(screen.getByText("Open Data Attribution")).toBeTruthy();
    expect(screen.getByText("Privacy & Local Data Storage")).toBeTruthy();
    expect(
      screen.getByText("LineWatchTO is unofficial transit software and is not affiliated with TTC or Metrolinx.")
    ).toBeTruthy();
  });

  it("renders external resource links with accessible link roles", async () => {
    await render(<MoreScreen />, { wrapper: Wrapper });

    const openDataLink = screen.getByTestId("resource-link-TTC Open Data (City of Toronto)");
    expect(openDataLink).toBeTruthy();
    expect(openDataLink.props.accessibilityRole).toBe("link");
  });

  it("opens external URL when a resource link is pressed", async () => {
    const canOpenSpy = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true as never);
    const openUrlSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);

    await render(<MoreScreen />, { wrapper: Wrapper });

    const openDataLink = screen.getByTestId("resource-link-TTC Open Data (City of Toronto)");
    fireEvent.press(openDataLink);

    await waitFor(() => {
      expect(canOpenSpy).toHaveBeenCalledWith("https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/");
      expect(openUrlSpy).toHaveBeenCalledWith("https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/");
    });
  });
});
