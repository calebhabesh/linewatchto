import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  confirmEmailVerification as apiConfirmEmailVerification,
  confirmPasswordReset as apiConfirmPasswordReset,
  demoLogin as apiDemoLogin,
  devLogin as apiDevLogin,
  fetchAuthConfig,
  fetchCurrentUser,
  googleLogin as apiGoogleLogin,
  linkGoogle as apiLinkGoogle,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  requestEmailVerification as apiRequestEmailVerification,
  requestPasswordReset as apiRequestPasswordReset,
} from "@/api/auth";
import type {
  AuthConfig,
  EmailVerificationRequestResponse,
  PasswordResetRequestResponse,
  User,
} from "@/api/auth-schema";
import { sessionTokenStore } from "@/storage/session-token";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  user: User | null;
  sessionToken: string | null;
  status: AuthStatus;
  authConfig: AuthConfig | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; displayName?: string }) => Promise<EmailVerificationRequestResponse>;
  requestEmailVerification: (email: string) => Promise<EmailVerificationRequestResponse>;
  confirmEmailVerification: (token: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<PasswordResetRequestResponse>;
  confirmPasswordReset: (data: { token: string; newPassword: string }) => Promise<void>;
  loginWithGoogle: (payload: { credential?: string; code?: string; state?: string; redirectUri?: string }) => Promise<void>;
  linkGoogleAccount: (payload: { credential?: string; code?: string; state?: string; redirectUri?: string }) => Promise<void>;
  demoLogin: () => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  const initSession = useCallback(async () => {
    try {
      const storedToken = await sessionTokenStore.get();
      if (!storedToken) {
        setStatus("unauthenticated");
        setUser(null);
        setSessionToken(null);
        return;
      }
      const response = await fetchCurrentUser(storedToken);
      if (response.authenticated && response.user) {
        setUser(response.user);
        setSessionToken(storedToken);
        setStatus("authenticated");
      } else {
        await sessionTokenStore.clear();
        setUser(null);
        setSessionToken(null);
        setStatus("unauthenticated");
      }
    } catch {
      setStatus("unauthenticated");
      setUser(null);
      setSessionToken(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const storedToken = await sessionTokenStore.get();
        if (!active) return;
        if (!storedToken) {
          setStatus("unauthenticated");
          setUser(null);
          setSessionToken(null);
          return;
        }
        const response = await fetchCurrentUser(storedToken);
        if (!active) return;
        if (response.authenticated && response.user) {
          setUser(response.user);
          setSessionToken(storedToken);
          setStatus("authenticated");
        } else {
          await sessionTokenStore.clear();
          if (!active) return;
          setUser(null);
          setSessionToken(null);
          setStatus("unauthenticated");
        }
      } catch {
        if (!active) return;
        setStatus("unauthenticated");
        setUser(null);
        setSessionToken(null);
      }
    })();

    void fetchAuthConfig()
      .then((cfg) => {
        if (active) setAuthConfig(cfg);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleAuthenticatedSession = useCallback(
    async (token: string | undefined, authenticatedUser: User | null) => {
      if (token && authenticatedUser) {
        await sessionTokenStore.set(token);
        setSessionToken(token);
        setUser(authenticatedUser);
        setStatus("authenticated");
      }
    },
    [],
  );

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      const response = await apiLogin(credentials);
      if (response.authenticated && response.user && response.sessionToken) {
        await handleAuthenticatedSession(response.sessionToken, response.user);
      }
    },
    [handleAuthenticatedSession],
  );

  const register = useCallback(
    async (data: { email: string; password: string; displayName?: string }) => {
      return apiRegister(data);
    },
    [],
  );

  const requestEmailVerification = useCallback(async (email: string) => {
    return apiRequestEmailVerification({ email });
  }, []);

  const confirmEmailVerification = useCallback(
    async (token: string) => {
      const response = await apiConfirmEmailVerification({ token });
      if (response.authenticated && response.user && response.sessionToken) {
        await handleAuthenticatedSession(response.sessionToken, response.user);
      }
    },
    [handleAuthenticatedSession],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    return apiRequestPasswordReset({ email });
  }, []);

  const confirmPasswordReset = useCallback(
    async (data: { token: string; newPassword: string }) => {
      const response = await apiConfirmPasswordReset(data);
      if (response.authenticated && response.user && response.sessionToken) {
        await handleAuthenticatedSession(response.sessionToken, response.user);
      }
    },
    [handleAuthenticatedSession],
  );

  const loginWithGoogle = useCallback(
    async (payload: { credential?: string; code?: string; state?: string; redirectUri?: string }) => {
      const response = await apiGoogleLogin(payload);
      if (response.authenticated && response.user && response.sessionToken) {
        await handleAuthenticatedSession(response.sessionToken, response.user);
      }
    },
    [handleAuthenticatedSession],
  );

  const linkGoogleAccount = useCallback(
    async (payload: { credential?: string; code?: string; state?: string; redirectUri?: string }) => {
      if (!sessionToken) {
        throw new Error("You must be signed in to link a Google account.");
      }
      const response = await apiLinkGoogle(sessionToken, payload);
      if (response.user) {
        setUser(response.user);
      }
    },
    [sessionToken],
  );

  const demoLogin = useCallback(async () => {
    const response = await apiDemoLogin();
    if (response.authenticated && response.user && response.sessionToken) {
      await handleAuthenticatedSession(response.sessionToken, response.user);
    }
  }, [handleAuthenticatedSession]);

  const devLogin = useCallback(async () => {
    const response = await apiDevLogin();
    if (response.authenticated && response.user && response.sessionToken) {
      await handleAuthenticatedSession(response.sessionToken, response.user);
    }
  }, [handleAuthenticatedSession]);

  const logout = useCallback(async () => {
    try {
      await apiLogout(sessionToken);
    } catch {
      // ignore logout network errors
    } finally {
      await sessionTokenStore.clear();
      setUser(null);
      setSessionToken(null);
      setStatus("unauthenticated");
    }
  }, [sessionToken]);

  const refresh = useCallback(async () => {
    await initSession();
  }, [initSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionToken,
      status,
      authConfig,
      login,
      register,
      requestEmailVerification,
      confirmEmailVerification,
      requestPasswordReset,
      confirmPasswordReset,
      loginWithGoogle,
      linkGoogleAccount,
      demoLogin,
      devLogin,
      logout,
      refresh,
    }),
    [
      user,
      sessionToken,
      status,
      authConfig,
      login,
      register,
      requestEmailVerification,
      confirmEmailVerification,
      requestPasswordReset,
      confirmPasswordReset,
      loginWithGoogle,
      linkGoogleAccount,
      demoLogin,
      devLogin,
      logout,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
