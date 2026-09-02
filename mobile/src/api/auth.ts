import {
  authConfigSchema,
  authResponseSchema,
  emailVerificationRequestResponseSchema,
  passwordResetRequestResponseSchema,
  type AuthConfig,
  type AuthResponse,
  type EmailVerificationRequestResponse,
  type PasswordResetRequestResponse,
} from "./auth-schema";
import { getJson, postJson } from "./client";

export async function fetchAuthConfig(signal?: AbortSignal): Promise<AuthConfig> {
  return getJson("/api/auth/config", authConfigSchema, signal);
}

export async function fetchCurrentUser(
  token: string,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return getJson("/api/auth/me", authResponseSchema, { token, signal });
}

export async function login(
  body: { email: string; password: string },
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson("/api/auth/login", authResponseSchema, body, { signal });
}

export async function register(
  body: { email: string; password: string; displayName?: string },
  signal?: AbortSignal,
): Promise<EmailVerificationRequestResponse> {
  return postJson(
    "/api/auth/register",
    emailVerificationRequestResponseSchema,
    body,
    { signal },
  );
}

export async function requestEmailVerification(
  body: { email: string },
  signal?: AbortSignal,
): Promise<EmailVerificationRequestResponse> {
  return postJson(
    "/api/auth/email-verification/request",
    emailVerificationRequestResponseSchema,
    body,
    { signal },
  );
}

export async function confirmEmailVerification(
  body: { token: string },
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson(
    "/api/auth/email-verification/confirm",
    authResponseSchema,
    body,
    { signal },
  );
}

export async function requestPasswordReset(
  body: { email: string },
  signal?: AbortSignal,
): Promise<PasswordResetRequestResponse> {
  return postJson(
    "/api/auth/password-reset/request",
    passwordResetRequestResponseSchema,
    body,
    { signal },
  );
}

export async function confirmPasswordReset(
  body: { token: string; newPassword: string },
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson(
    "/api/auth/password-reset/confirm",
    authResponseSchema,
    body,
    { signal },
  );
}

export async function googleLogin(
  body: { credential?: string; code?: string; state?: string; redirectUri?: string },
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson("/api/auth/google", authResponseSchema, body, { signal });
}

export async function linkGoogle(
  token: string,
  body: { credential?: string; code?: string; state?: string; redirectUri?: string },
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson("/api/auth/google/link", authResponseSchema, body, { token, signal });
}

export async function demoLogin(signal?: AbortSignal): Promise<AuthResponse> {
  return postJson("/api/auth/demo", authResponseSchema, {}, { signal });
}

export async function devLogin(signal?: AbortSignal): Promise<AuthResponse> {
  return postJson("/api/auth/dev", authResponseSchema, {}, { signal });
}

export async function logout(
  token?: string | null,
  pushEndpoint?: string | null,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return postJson(
    "/api/auth/logout",
    authResponseSchema,
    pushEndpoint ? { pushEndpoint } : {},
    { token, signal },
  );
}
