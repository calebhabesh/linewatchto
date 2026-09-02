import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  demo: z.boolean(),
  googleLinked: z.boolean(),
});

export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  authenticated: z.boolean(),
  user: userSchema.nullable(),
  sessionToken: z.string().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authConfigSchema = z.object({
  googleSignInAvailable: z.boolean(),
  googleClientId: z.string(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

export const emailVerificationRequestResponseSchema = z.object({
  accepted: z.boolean(),
  message: z.string(),
  devVerificationToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export type EmailVerificationRequestResponse = z.infer<typeof emailVerificationRequestResponseSchema>;

export const passwordResetRequestResponseSchema = z.object({
  accepted: z.boolean(),
  message: z.string(),
  devResetToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export type PasswordResetRequestResponse = z.infer<typeof passwordResetRequestResponseSchema>;
