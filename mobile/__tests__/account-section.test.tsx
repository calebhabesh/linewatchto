import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AccountSection } from "@/features/more/account-section";
import { AuthProvider } from "@/state/auth-provider";
import { sessionTokenStore } from "@/storage/session-token";
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

import * as authApi from "@/api/auth";

function renderWithProviders() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AccountSection />
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("AccountSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({
      googleSignInAvailable: false,
      googleClientId: "",
    });
  });

  it("renders unauthenticated form with sign-in and demo options", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("account-unauthenticated-section")).toBeTruthy();
    });

    expect(screen.getByTestId("account-email-input")).toBeTruthy();
    expect(screen.getByTestId("account-password-input")).toBeTruthy();
    expect(screen.getByTestId("account-submit-button")).toBeTruthy();
    expect(screen.getByTestId("account-demo-button")).toBeTruthy();
  });

  it("switches to create account tab and shows display name field", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("account-tab-register")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("account-tab-register"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("account-name-input")).toBeTruthy();
      expect(screen.getByTestId("account-submit-button")).toBeTruthy();
      expect(screen.getAllByText("Create Account").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders authenticated profile with user details and logout action", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("test-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_123",
        email: "transit.rider@example.com",
        displayName: "Jane Rider",
        demo: true,
        googleLinked: false,
      },
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("account-authenticated-section")).toBeTruthy();
    });

    expect(screen.getByText("Jane Rider")).toBeTruthy();
    expect(screen.getByText("transit.rider@example.com")).toBeTruthy();
    expect(screen.getByText("DEMO")).toBeTruthy();
    expect(screen.getByTestId("account-logout-button")).toBeTruthy();
  });

  it("triggers demo login when demo button is pressed", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.demoLogin as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: {
        id: "demo_user",
        email: "demo@linewatch.local",
        displayName: "Demo Rider",
        demo: true,
        googleLinked: false,
      },
      sessionToken: "demo-token",
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("account-demo-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("account-demo-button"));
    });

    await waitFor(() => {
      expect(authApi.demoLogin).toHaveBeenCalled();
      expect(screen.getByText("Demo Rider")).toBeTruthy();
    });
  });
});
