import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { MoreScreen } from "@/features/more/more-screen";
import { AuthProvider } from "@/state/auth-provider";
import { PushNotificationsProvider } from "@/state/push-notifications-provider";
import { ThemeProvider, useTheme } from "@/theme/theme-provider";
import { themes } from "@/theme/tokens";

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

describe("Theme & Display Preference Persistence", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({ googleSignInAvailable: false, googleClientId: "" });
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });
    (pushApi.fetchPushConfig as jest.MockedFunction<any>).mockResolvedValue(null);
    await AsyncStorage.clear();
  });

  it("renders display options with dark mode selected by default", async () => {
    await render(<MoreScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Display")).toBeTruthy();
    expect(screen.getByText("High contrast increases borders and foreground separation across the app.")).toBeTruthy();

    const darkChoice = screen.getByRole("radio", { name: "Dark" });
    const highContrastChoice = screen.getByRole("radio", { name: "High contrast" });

    expect(darkChoice.props.accessibilityState.checked).toBe(true);
    expect(highContrastChoice.props.accessibilityState.checked).toBe(false);
  });

  it("switches to high-contrast mode and writes preference to AsyncStorage", async () => {
    await render(<MoreScreen />, { wrapper: Wrapper });

    const highContrastChoice = screen.getByRole("radio", { name: "High contrast" });
    await act(async () => {
      fireEvent.press(highContrastChoice);
    });

    const darkChoice = screen.getByRole("radio", { name: "Dark" });
    expect(highContrastChoice.props.accessibilityState.checked).toBe(true);
    expect(darkChoice.props.accessibilityState.checked).toBe(false);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("linewatch.theme-mode", "high-contrast");
  });

  it("switches back to dark mode and updates AsyncStorage", async () => {
    await render(<MoreScreen />, { wrapper: Wrapper });

    // Switch to high contrast first
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "High contrast" }));
    });

    // Switch back to dark
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    });

    const darkChoice = screen.getByRole("radio", { name: "Dark" });
    expect(darkChoice.props.accessibilityState.checked).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("linewatch.theme-mode", "dark");
  });

  it("restores high-contrast theme from AsyncStorage on app launch", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");

    await render(<MoreScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      const highContrastChoice = screen.getByRole("radio", { name: "High contrast" });
      expect(highContrastChoice.props.accessibilityState.checked).toBe(true);
    });
  });

  it("verifies theme tokens maintain strict border and radius constraints", () => {
    expect(themes.dark.color.background).toBe("#0d0808");
    expect(themes["high-contrast"].color.background).toBe("#000000");

    // Radius constraints: max 8px
    expect(themes.dark.radius.small).toBeLessThanOrEqual(8);
    expect(themes.dark.radius.medium).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.small).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.medium).toBeLessThanOrEqual(8);
  });
});
