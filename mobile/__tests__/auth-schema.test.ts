import { describe, expect, it } from "@jest/globals";

import {
  authConfigSchema,
  authResponseSchema,
  emailVerificationRequestResponseSchema,
  passwordResetRequestResponseSchema,
  userSchema,
} from "@/api/auth-schema";

describe("auth schema contract", () => {
  it("parses valid user schema", () => {
    const parsed = userSchema.parse({
      id: "user_123",
      email: "rider@example.com",
      displayName: "Transit Rider",
      demo: false,
      googleLinked: true,
    });
    expect(parsed.id).toBe("user_123");
    expect(parsed.email).toBe("rider@example.com");
    expect(parsed.demo).toBe(false);
  });

  it("parses authenticated auth response with session token", () => {
    const parsed = authResponseSchema.parse({
      authenticated: true,
      user: {
        id: "user_456",
        email: "demo@linewatch.local",
        displayName: "Demo Rider",
        demo: true,
        googleLinked: false,
      },
      sessionToken: "raw-session-token-xyz",
    });
    expect(parsed.authenticated).toBe(true);
    expect(parsed.user?.demo).toBe(true);
    expect(parsed.sessionToken).toBe("raw-session-token-xyz");
  });

  it("parses unauthenticated auth response", () => {
    const parsed = authResponseSchema.parse({
      authenticated: false,
      user: null,
    });
    expect(parsed.authenticated).toBe(false);
    expect(parsed.user).toBeNull();
  });

  it("parses auth config and verification responses", () => {
    const config = authConfigSchema.parse({
      googleSignInAvailable: true,
      googleClientId: "google-client-id",
    });
    expect(config.googleSignInAvailable).toBe(true);

    const emailRes = emailVerificationRequestResponseSchema.parse({
      accepted: true,
      message: "Check your email",
      devVerificationToken: "dev-token-123",
      expiresAt: "2026-09-02T12:00:00Z",
    });
    expect(emailRes.accepted).toBe(true);

    const resetRes = passwordResetRequestResponseSchema.parse({
      accepted: true,
      message: "Password reset link sent",
      devResetToken: null,
      expiresAt: null,
    });
    expect(resetRes.accepted).toBe(true);
  });
});
