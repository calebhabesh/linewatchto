import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AccountState,
  type AuthConfig,
  getAuthConfig,
  getCurrentAccountWithRetry,
  loginDemoAccount,
  logoutAccount,
  preserveAccountStateDuringOutage,
  unavailableAuthConfig,
} from "../app/auth-data.ts";

export type UseAccountSessionOptions = {
  initialAccountState?: AccountState;
  initialAuthConfig?: AuthConfig;
  onSignOut?: () => void;
};

export type AccountSession = {
  accountState: AccountState;
  setAccountState: React.Dispatch<React.SetStateAction<AccountState>>;
  userGeneration: number;
  userGenerationRef: React.MutableRefObject<number>;
  authConfig: AuthConfig;
  refreshAccount: () => Promise<AccountState>;
  signOut: (options?: { pushEndpoint?: string | null }) => Promise<void>;
  loginDemo: () => Promise<AccountState>;
  isSigningOut: boolean;
};

/**
 * Returns true if two account states represent different user sessions.
 * Distinct user sessions include transitioning between signed-in and signed-out,
 * or switching between two distinct authenticated user IDs.
 */
export function didUserSessionChange(previous: AccountState, next: AccountState): boolean {
  if (previous.authenticated !== next.authenticated) {
    return true;
  }
  if (!previous.authenticated && !next.authenticated) {
    return false;
  }
  return previous.user?.id !== next.user?.id;
}

/**
 * Reconciles account state during outages using domain rules.
 */
export function reconcileAccountState(current: AccountState, fetched: AccountState): AccountState {
  return preserveAccountStateDuringOutage(current, fetched);
}

export const INITIAL_ACCOUNT_STATE: AccountState = {
  source: "unavailable",
  authenticated: false,
  user: null,
};

export function useAccountSession(options?: UseAccountSessionOptions): AccountSession {
  const { onSignOut } = options ?? {};

  const [accountState, setAccountStateRaw] = useState<AccountState>(
    options?.initialAccountState ?? INITIAL_ACCOUNT_STATE,
  );
  const [authConfig, setAuthConfig] = useState<AuthConfig>(
    options?.initialAuthConfig ?? unavailableAuthConfig,
  );
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Monotonic generation counter tracking user identity transitions.
  // Incrementing this counter invalidates any in-flight reads (commutes, saved stations)
  // associated with a prior user or session state.
  const userGenerationRef = useRef<number>(1);
  const [userGeneration, setUserGeneration] = useState<number>(1);

  const lastUserIdentityRef = useRef<string | null>(
    accountState.authenticated ? accountState.user?.id ?? "__authenticated__" : null,
  );

  const setAccountState = useCallback((action: React.SetStateAction<AccountState>) => {
    setAccountStateRaw((current) => {
      const next = typeof action === "function" ? action(current) : action;
      if (didUserSessionChange(current, next)) {
        userGenerationRef.current += 1;
        lastUserIdentityRef.current = next.authenticated ? next.user?.id ?? "__authenticated__" : null;
        const nextGen = userGenerationRef.current;
        queueMicrotask(() => {
          setUserGeneration(nextGen);
        });
      }
      return next;
    });
  }, []);

  const refreshAccountPromiseRef = useRef<Promise<AccountState> | null>(null);

  const refreshAccount = useCallback((): Promise<AccountState> => {
    if (refreshAccountPromiseRef.current) {
      return refreshAccountPromiseRef.current;
    }

    const request = getCurrentAccountWithRetry()
      .then((state) => {
        setAccountStateRaw((current) => {
          const next = reconcileAccountState(current, state);
          if (didUserSessionChange(current, next)) {
            userGenerationRef.current += 1;
            lastUserIdentityRef.current = next.authenticated ? next.user?.id ?? "__authenticated__" : null;
            const nextGen = userGenerationRef.current;
            queueMicrotask(() => {
              setUserGeneration(nextGen);
            });
          }
          return next;
        });
        return state;
      })
      .finally(() => {
        refreshAccountPromiseRef.current = null;
      });

    refreshAccountPromiseRef.current = request;
    return request;
  }, []);

  const signOut = useCallback(
    async (signOutOptions?: { pushEndpoint?: string | null }) => {
      setIsSigningOut(true);
      // Immediately increment generation to discard any in-flight reads from the signing-out user
      userGenerationRef.current += 1;
      const nextGen = userGenerationRef.current;
      setUserGeneration(nextGen);
      lastUserIdentityRef.current = null;

      const unauthenticatedState: AccountState = {
        source: "backend",
        authenticated: false,
        user: null,
      };
      setAccountStateRaw(unauthenticatedState);

      try {
        await logoutAccount({ pushEndpoint: signOutOptions?.pushEndpoint ?? null });
      } finally {
        setIsSigningOut(false);
        onSignOut?.();
      }
    },
    [onSignOut],
  );

  const loginDemo = useCallback(async (): Promise<AccountState> => {
    const response = await loginDemoAccount();
    const nextState: AccountState = {
      source: "backend",
      authenticated: response.authenticated,
      user: response.user,
    };
    userGenerationRef.current += 1;
    const nextGen = userGenerationRef.current;
    setUserGeneration(nextGen);
    lastUserIdentityRef.current = response.user?.id ?? "__authenticated__";
    setAccountStateRaw(nextState);
    return nextState;
  }, []);

  // Hydrate auth configuration
  useEffect(() => {
    let cancelled = false;
    getAuthConfig().then((result) => {
      if (!cancelled) {
        setAuthConfig(result.config);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial account hydration and connection/visibility listeners
  useEffect(() => {
    let cancelled = false;
    let request: Promise<AccountState> | null = null;

    const performRefresh = () => {
      if (request) return request;
      request = getCurrentAccountWithRetry()
        .then((state) => {
          if (!cancelled) {
            setAccountStateRaw((current) => {
              const next = reconcileAccountState(current, state);
              if (didUserSessionChange(current, next)) {
                userGenerationRef.current += 1;
                lastUserIdentityRef.current = next.authenticated ? next.user?.id ?? "__authenticated__" : null;
                const nextGen = userGenerationRef.current;
                queueMicrotask(() => {
                  setUserGeneration(nextGen);
                });
              }
              return next;
            });
          }
          return state;
        })
        .finally(() => {
          request = null;
        });
      return request;
    };

    const handleOnline = () => {
      void performRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void performRefresh();
      }
    };

    void performRefresh();
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return {
    accountState,
    setAccountState,
    userGeneration,
    userGenerationRef,
    authConfig,
    refreshAccount,
    signOut,
    loginDemo,
    isSigningOut,
  };
}
