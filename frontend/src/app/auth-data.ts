import {
  apiUrl,
  accountJsonRequest,
  type AdapterOptions,
  type AccountRetryOptions,
} from "./account-transport.ts";

export type LogoutOptions = AdapterOptions & {
  pushEndpoint?: string | null;
};

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  demo: boolean;
  googleLinked: boolean;
};

export type AccountState = {
  source: "backend" | "unavailable";
  authenticated: boolean;
  user: AccountUser | null;
  message?: string;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AccountUser | null;
};

export type AuthConfig = {
  googleSignInAvailable: boolean;
  googleClientId: string;
};

export type GoogleAuthMode = "login" | "link";

export type AuthConfigResult = {
  source: "backend" | "unavailable";
  config: AuthConfig;
  message?: string;
};

export const unavailableAuthConfig: AuthConfig = {
  googleSignInAvailable: false,
  googleClientId: "",
};

export type PasswordResetRequestResponse = {
  accepted: boolean;
  message: string;
  devResetToken?: string | null;
  expiresAt?: string | null;
};

export type EmailVerificationRequestResponse = {
  accepted: boolean;
  message: string;
  devVerificationToken?: string | null;
  expiresAt?: string | null;
};

function normalizeGoogleReturnTo(returnTo?: string) {
  const candidate = returnTo ?? currentBrowserPath();
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\n") ||
    candidate.includes("\r")
  ) {
    return "/";
  }
  return candidate;
}

function currentBrowserPath() {
  if (typeof window === "undefined") {
    return "/";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

export function googleAuthStartUrl(input: { mode: GoogleAuthMode; returnTo?: string }, options: AdapterOptions = {}) {
  const params = new URLSearchParams({
    mode: input.mode,
    returnTo: normalizeGoogleReturnTo(input.returnTo),
  });
  return apiUrl(`/api/auth/google/start?${params.toString()}`, options);
}

export async function getAuthConfig(options: AdapterOptions = {}): Promise<AuthConfigResult> {
  try {
    const config = await accountJsonRequest<AuthConfig>("/api/auth/config", { method: "GET", headers: {} }, options);
    return { source: "backend", config };
  } catch {
    return {
      source: "unavailable",
      config: unavailableAuthConfig,
      message: "Auth configuration unavailable.",
    };
  }
}

export async function loginWithGoogle(input: { credential: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>("/api/auth/google", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function linkGoogleAccount(input: { credential: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>("/api/auth/google/link", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function getCurrentAccount(options: AdapterOptions = {}): Promise<AccountState> {
  try {
    const response = await accountJsonRequest<AuthResponse>("/api/auth/me", { method: "GET", headers: {} }, options);
    return { source: "backend", authenticated: response.authenticated, user: response.user };
  } catch {
    return {
      source: "unavailable",
      authenticated: false,
      user: null,
      message: "Account service unavailable.",
    };
  }
}

const DEFAULT_ACCOUNT_RETRY_DELAYS_MS = [1_000, 3_000, 10_000];

export async function getCurrentAccountWithRetry(options: AccountRetryOptions = {}): Promise<AccountState> {
  const {
    retryDelaysMs = DEFAULT_ACCOUNT_RETRY_DELAYS_MS,
    wait = (delayMs) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs)),
    ...adapterOptions
  } = options;

  let state = await getCurrentAccount(adapterOptions);
  for (const delayMs of retryDelaysMs) {
    if (state.source === "backend") return state;
    await wait(Math.max(0, delayMs));
    state = await getCurrentAccount(adapterOptions);
  }
  return state;
}

export function preserveAccountStateDuringOutage(current: AccountState, refreshed: AccountState): AccountState {
  if (refreshed.source !== "unavailable" || !current.authenticated || current.user === null) {
    return refreshed;
  }
  return {
    ...current,
    source: "unavailable",
    message: refreshed.message,
  };
}

export async function registerAccount(input: { email: string; displayName: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<EmailVerificationRequestResponse>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function loginAccount(input: { email: string; password: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function requestPasswordReset(input: { email: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<PasswordResetRequestResponse>(
    "/api/auth/password-reset/request",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function requestEmailVerification(input: { email: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<EmailVerificationRequestResponse>(
    "/api/auth/email-verification/request",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function confirmEmailVerification(input: { token: string; password: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>(
    "/api/auth/email-verification/confirm",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function confirmPasswordReset(input: { token: string; password: string }, options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>(
    "/api/auth/password-reset/confirm",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function loginDemoAccount(options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>("/api/auth/demo", { method: "POST" }, options);
}

export async function loginDevAccount(options: AdapterOptions = {}) {
  return accountJsonRequest<AuthResponse>("/api/auth/dev", { method: "POST" }, options);
}

export async function logoutAccount(options: LogoutOptions = {}) {
  const pushEndpoint = typeof options.pushEndpoint === "string" ? options.pushEndpoint.trim() : "";
  return accountJsonRequest<AuthResponse>(
    "/api/auth/logout",
    {
      method: "POST",
      ...(pushEndpoint ? { body: JSON.stringify({ pushEndpoint }) } : {}),
    },
    options,
  );
}
