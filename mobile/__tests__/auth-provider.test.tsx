import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import * as authApi from "@/api/auth";
import { AuthProvider, useAuth } from "@/state/auth-provider";
import { sessionTokenStore } from "@/storage/session-token";

jest.mock("@/storage/session-token", () => ({
  sessionTokenStore: {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock("@/api/auth");

const wrapper = ({ children }: PropsWithChildren) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.fetchAuthConfig as jest.MockedFunction<any>).mockResolvedValue({
      googleSignInAvailable: false,
      googleClientId: "",
    });
  });

  it("initializes as unauthenticated when no token is stored", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });
    expect(result.current.user).toBeNull();
  });

  it("restores valid session from SecureStore on startup", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("stored-token-123");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_1",
        email: "rider@example.com",
        displayName: "Rider One",
        demo: false,
        googleLinked: false,
      },
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(result.current.user?.email).toBe("rider@example.com");
    expect(result.current.sessionToken).toBe("stored-token-123");
  });

  it("clears store if stored token is rejected by backend", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue("invalid-token");
    (authApi.fetchCurrentUser as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: false,
      user: null,
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });
    expect(sessionTokenStore.clear).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it("handles successful login and saves token to SecureStore", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.login as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_login",
        email: "login@example.com",
        displayName: "Login User",
        demo: false,
        googleLinked: false,
      },
      sessionToken: "new-token-456",
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    await act(async () => {
      await result.current.login({ email: "login@example.com", password: "password123" });
    });

    expect(sessionTokenStore.set).toHaveBeenCalledWith("new-token-456");
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.email).toBe("login@example.com");
  });

  it("handles demo login and logout", async () => {
    (sessionTokenStore.get as jest.MockedFunction<any>).mockResolvedValue(null);
    (authApi.demoLogin as jest.MockedFunction<any>).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_demo",
        email: "demo@linewatch.local",
        displayName: "Demo Rider",
        demo: true,
        googleLinked: false,
      },
      sessionToken: "demo-token-789",
    });
    (authApi.logout as jest.MockedFunction<any>).mockResolvedValue({ authenticated: false, user: null });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    await act(async () => {
      await result.current.demoLogin();
    });

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.demo).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(sessionTokenStore.clear).toHaveBeenCalled();
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });
});
