"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { AccountRequestError } from "../app/account-transport";
import {
  normalizeAccountEmail,
  validateAccountCredentials,
  validateAccountEmail,
} from "../app/account-validation";
import {
  type AccountState,
  type AuthConfig,
  confirmEmailVerification,
  confirmPasswordReset,
  loginAccount,
  registerAccount,
  requestEmailVerification,
  requestPasswordReset,
} from "../app/auth-data";
import { GoogleSignInButton } from "./GoogleSignInButton";

import {
  type AccountDialogMode,
  type AccountEntryIntent,
  type AccountDialogIntentOptions,
  GOOGLE_LINK_SUCCESS_PARAM,
  GOOGLE_LINK_SUCCESS_VALUE,
  GOOGLE_LINK_SUCCESS_MESSAGE,
  googleLinkSuccessReturnTo,
  accountDialogTitle,
  accountDialogAriaLabel,
  accountDialogDescription,
} from "./account-dialog-state";

export {
  type AccountDialogMode,
  type AccountEntryIntent,
  type AccountDialogIntentOptions,
  GOOGLE_LINK_SUCCESS_PARAM,
  GOOGLE_LINK_SUCCESS_VALUE,
  GOOGLE_LINK_SUCCESS_MESSAGE,
  googleLinkSuccessReturnTo,
  accountDialogTitle,
  accountDialogAriaLabel,
  accountDialogDescription,
};

export type AccountDialogProps = {
  isOpen: boolean;
  request?: AccountDialogIntentOptions | null;
  accountState: AccountState;
  authConfig: AuthConfig;
  reducedMotion?: boolean;
  onClose: () => void;
  onAuthenticated: (state: AccountState) => void;
  onDemoAccount?: () => Promise<void> | void;
};

export function AccountDialog({
  isOpen,
  request,
  accountState,
  authConfig,
  reducedMotion = false,
  onClose,
  onAuthenticated,
}: AccountDialogProps) {
  const router = useRouter();

  const [mode, setMode] = useState<AccountDialogMode>(() => request?.mode ?? "auth-choice");
  const [entryIntent, setEntryIntent] = useState<AccountEntryIntent>(() => request?.entryIntent ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetToken, setResetToken] = useState(() => (request?.mode === "reset-password" ? request?.initialToken ?? "" : ""));
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState(() => (request?.mode === "verify-email" ? request?.initialToken ?? "" : ""));
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [devVerificationToken, setDevVerificationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => request?.error ?? null);
  const [successMessage, setSuccessMessage] = useState<string | null>(() => request?.successMessage ?? null);
  const [busy, setBusy] = useState(false);

  // Closing animation state
  const [isClosing, setIsClosing] = useState(false);
  const closingTimeoutRef = useRef<number | null>(null);
  const wasOpenRef = useRef(isOpen);

  const resetForm = useCallback(() => {
    setEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setDisplayName("");
    setResetToken("");
    setResetMessage(null);
    setDevResetToken(null);
    setVerificationToken("");
    setVerificationMessage(null);
    setDevVerificationToken(null);
    setError(null);
    setSuccessMessage(null);
  }, []);

  // Sync incoming request options when opened or updated
  useEffect(() => {
    if (!isOpen) return;

    if (request?.mode) {
      setMode(request.mode);
    } else if (request?.entryIntent) {
      setMode("auth-choice");
    }

    if (request?.entryIntent) {
      setEntryIntent(request.entryIntent);
    }

    if (request?.initialToken) {
      if (request.mode === "reset-password") {
        setResetToken(request.initialToken);
      } else if (request.mode === "verify-email") {
        setVerificationToken(request.initialToken);
      }
    }

    if (request?.error !== undefined) {
      setError(request.error);
    }

    if (request?.successMessage !== undefined) {
      setSuccessMessage(request.successMessage);
    }
  }, [isOpen, request]);

  // Handle transitions when isOpen changes
  useEffect(() => {
    if (closingTimeoutRef.current !== null) {
      window.clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    if (isOpen) {
      setIsClosing(false);
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (reducedMotion) {
        setIsClosing(false);
      } else {
        setIsClosing(true);
        closingTimeoutRef.current = window.setTimeout(() => {
          setIsClosing(false);
          closingTimeoutRef.current = null;
        }, 180);
      }
    }

    return () => {
      if (closingTimeoutRef.current !== null) {
        window.clearTimeout(closingTimeoutRef.current);
      }
    };
  }, [isOpen, reducedMotion]);

  const handleDismiss = useCallback(() => {
    if (isClosing) return;
    onClose();
  }, [isClosing, onClose]);

  const openEmailAuth = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
    setMode(entryIntent);
  }, [entryIntent]);

  const handleRequestPasswordReset = async () => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setError(null);
    setResetMessage(null);
    setDevResetToken(null);
    try {
      const response = await requestPasswordReset({ email: normalizedEmail });
      setEmail(normalizedEmail);
      setResetMessage(response.message);
      setDevResetToken(response.devResetToken ?? null);
    } catch (err) {
      if (err instanceof AccountRequestError) {
        setError(err.message);
      } else {
        setError("Password reset is unavailable.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetToken.trim()) {
      setError("Enter the reset token.");
      return;
    }
    const validation = validateAccountCredentials({
      mode: "register",
      email: email || "reset@example.com",
      password,
    });
    if (!validation.valid && validation.message !== "Enter a valid email address.") {
      setError(validation.message);
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await confirmPasswordReset({
        token: resetToken.trim(),
        password,
      });
      onAuthenticated({
        source: "backend",
        authenticated: response.authenticated,
        user: response.user,
      });
      resetForm();
      if (typeof window !== "undefined" && window.location.pathname === "/reset-password") {
        router.replace("/");
      }
      handleDismiss();
    } catch (err) {
      if (err instanceof AccountRequestError) {
        setError(err.message);
      } else {
        setError("Could not reset that password.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestEmailVerification = async () => {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await requestEmailVerification({ email: normalizedEmail });
      setEmail(normalizedEmail);
      setVerificationMessage(response.message);
      setDevVerificationToken(response.devVerificationToken ?? null);
      setVerificationToken(response.devVerificationToken ?? "");
    } catch (err) {
      if (err instanceof AccountRequestError) {
        setError(err.message);
      } else {
        setError("Email verification is unavailable.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEmailVerification = async (rawToken = verificationToken) => {
    const token = rawToken.trim();
    if (!token) {
      setError("Open the verification link from your email or request a new one.");
      return;
    }

    const passwordValidation = validateAccountCredentials({
      mode: "register",
      email: email || "verification@example.com",
      password,
    });
    if (!passwordValidation.valid && passwordValidation.message !== "Enter a valid email address.") {
      setError(passwordValidation.message);
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await confirmEmailVerification({ token, password });
      onAuthenticated({
        source: "backend",
        authenticated: response.authenticated,
        user: response.user,
      });
      setVerificationToken("");
      setDevVerificationToken(null);
      setVerificationMessage(null);
      setSuccessMessage("Email verified. You are now signed in.");
      router.replace("/");
    } catch (err) {
      if (err instanceof AccountRequestError) {
        setError(err.message);
      } else {
        setError("Could not verify that email.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitAccount = async () => {
    if (!mode) return;

    if (mode === "auth-choice" || mode === "link-google") {
      return;
    }

    if (mode === "verify-email") {
      if (verificationToken.trim()) {
        await handleConfirmEmailVerification();
      } else {
        await handleRequestEmailVerification();
      }
      return;
    }

    if (mode === "forgot-password") {
      void handleRequestPasswordReset();
      return;
    }

    if (mode === "reset-password") {
      void handleConfirmPasswordReset();
      return;
    }

    if (mode !== "login" && mode !== "register") {
      return;
    }

    const validation = mode === "register"
      ? validateAccountEmail(email)
      : validateAccountCredentials({
          mode: "login",
          email,
          password,
        });

    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const normalizedEmail = validation.normalizedEmail;
      if (mode === "login") {
        const response = await loginAccount({ email: normalizedEmail, password });
        onAuthenticated({
          source: "backend",
          authenticated: response.authenticated,
          user: response.user,
        });
        resetForm();
        handleDismiss();
      } else {
        const response = await registerAccount({
          email: normalizedEmail,
          displayName: displayName.trim(),
        });
        setEmail(normalizedEmail);
        setPassword("");
        setPasswordConfirmation("");
        setVerificationMessage(response.message);
        setDevVerificationToken(response.devVerificationToken ?? null);
        setVerificationToken(response.devVerificationToken ?? "");
        setMode("verify-email");
      }
    } catch (err) {
      if (err instanceof AccountRequestError) {
        if (mode === "login" && err.errorCode === "email_not_verified") {
          setVerificationMessage(err.message);
          setDevVerificationToken(null);
          setVerificationToken("");
          setMode("verify-email");
        } else {
          setError(err.message);
        }
      } else {
        setError(mode === "login" ? "Incorrect Email or Password." : "Could not create that account.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen && !isClosing) {
    return null;
  }

  return (
    <div
      className={`account-dialog-backdrop ${isClosing ? "account-dialog-backdrop--closing" : ""}`}
      role="presentation"
      onMouseDown={handleDismiss}
    >
      <section
        className={`account-dialog ${isClosing ? "account-dialog--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={accountDialogAriaLabel(mode, entryIntent)}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            handleDismiss();
          }
        }}
      >
        <div className="account-dialog-header">
          <div
            key={`intro-${mode}-${entryIntent}`}
            className="account-dialog-intro"
          >
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {accountDialogTitle(mode, entryIntent)}
            </h2>
            <p className="account-dialog-description">{accountDialogDescription(mode, entryIntent)}</p>
          </div>
          <button
            type="button"
            className="account-dialog-close"
            onClick={handleDismiss}
            aria-label="Close account dialog"
          >
            <X size={20} />
          </button>
        </div>

        <form
          key={`${mode}-${entryIntent}`}
          data-account-dialog-view={mode}
          data-account-dialog-intent={entryIntent}
          className="flex flex-col gap-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmitAccount();
          }}
        >
          {mode === "auth-choice" ? (
            <>
              <div className="account-provider-stack">
                {authConfig.googleSignInAvailable ? (
                  <>
                    <div aria-label="Continue With Google">
                      <GoogleSignInButton
                        disabled={busy}
                        mode="login"
                        onError={setError}
                      />
                    </div>
                    <div className="account-auth-divider" aria-hidden="true">
                      <span>Or</span>
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  className="account-choice-primary"
                  onClick={openEmailAuth}
                  disabled={busy}
                >
                  <Mail size={18} />
                  Continue With Email
                </button>
              </div>

              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}

              <div className="account-dialog-footer">
                <button
                  type="button"
                  className="account-switch-button"
                  onClick={() => {
                    setError(null);
                    setEntryIntent(entryIntent === "login" ? "register" : "login");
                  }}
                >
                  {entryIntent === "login" ? (
                    <>
                      <span className="account-switch-text">Don&apos;t have an account?</span>{" "}
                      <span className="account-switch-link">Sign Up</span>
                    </>
                  ) : (
                    <span className="account-switch-link">Already Have an Account?</span>
                  )}
                </button>
              </div>
            </>
          ) : mode === "link-google" ? (
            <>
              {successMessage ? (
                <div className="account-reset-status" role="status">
                  <p>{successMessage}</p>
                </div>
              ) : (
                <>
                  <p className="account-reset-hint">
                    Link Google sign-in to {accountState.user?.email}. The Google account email must match this LineWatch account.
                  </p>
                  {authConfig.googleSignInAvailable ? (
                    <div aria-label="Link Google">
                      <GoogleSignInButton
                        disabled={busy}
                        mode="link"
                        returnTo={googleLinkSuccessReturnTo()}
                        onError={setError}
                      />
                    </div>
                  ) : (
                    <p className="account-reset-hint">Google sign-in is not configured for this environment.</p>
                  )}
                </>
              )}
              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="account-link-button"
                onClick={() => {
                  setError(null);
                  handleDismiss();
                }}
              >
                Back To Account
              </button>
            </>
          ) : mode === "verify-email" ? (
            <>
              {successMessage ? (
                <div className="account-reset-status" role="status">
                  <p>{successMessage}</p>
                </div>
              ) : (
                <>
                  {verificationMessage ? (
                    <div className="account-reset-status" role="status">
                      <p>{verificationMessage}</p>
                    </div>
                  ) : busy ? (
                    <p className="account-reset-hint" role="status">Creating your verified account…</p>
                  ) : (
                    <p className="account-reset-hint">Use the secure link sent to your email address. Verification links expire after 24 hours.</p>
                  )}
                  {email ? (
                    <p className="account-reset-hint">Verification address: <strong>{email}</strong></p>
                  ) : !verificationToken || error ? (
                    <label className="account-field">
                      <span>{verificationToken ? "Email for a new link" : "Email"}</span>
                      <input
                        type="email"
                        value={email}
                        autoComplete="email"
                        onBlur={() => setEmail((current) => normalizeAccountEmail(current))}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {verificationToken ? (
                    <>
                      <p className="account-reset-hint">Choose the password you will use after verification. It was intentionally not accepted before mailbox ownership was proven.</p>
                      <label className="account-field">
                        <span>Password</span>
                        <input
                          type="password"
                          value={password}
                          autoComplete="new-password"
                          aria-describedby="account-verification-password-help"
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </label>
                      <label className="account-field">
                        <span>Confirm password</span>
                        <input
                          type="password"
                          value={passwordConfirmation}
                          autoComplete="new-password"
                          onChange={(event) => setPasswordConfirmation(event.target.value)}
                        />
                      </label>
                      <p id="account-verification-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        Use at least 8 characters with a letter and a number, symbol, or space.
                      </p>
                    </>
                  ) : null}
                  {devVerificationToken ? (
                    <>
                      <p className="account-reset-dev-note">Local dev mode: no email was sent. Use this one-time token to test account verification.</p>
                      <button
                        type="button"
                        className="account-primary-button"
                        onClick={() => void handleConfirmEmailVerification(devVerificationToken)}
                        disabled={busy}
                      >
                        Verify Local Account
                      </button>
                    </>
                  ) : null}
                </>
              )}
              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              {successMessage ? (
                <button
                  type="button"
                  className="account-primary-button"
                  onClick={() => {
                    handleDismiss();
                    resetForm();
                  }}
                >
                  Continue
                </button>
              ) : (
                <>
                  {verificationToken && !devVerificationToken && !busy ? (
                    <button
                      type="button"
                      className="account-primary-button"
                      onClick={() => void handleConfirmEmailVerification()}
                    >
                      Verify Email
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => void handleRequestEmailVerification()}
                    disabled={busy || !email.trim()}
                  >
                    Send New Verification Link
                  </button>
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setError(null);
                      setVerificationMessage(null);
                      setDevVerificationToken(null);
                      setMode("login");
                    }}
                  >
                    Back To Sign In
                  </button>
                </>
              )}
            </>
          ) : mode === "forgot-password" ? (
            <>
              <label className="account-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onBlur={() => setEmail((current) => normalizeAccountEmail(current))}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {resetMessage ? (
                <div className="account-reset-status" role="status">
                  <p>{resetMessage}</p>
                  {devResetToken ? (
                    <>
                      <p className="account-reset-dev-note">Local dev mode: no email was sent. Use this generated token to test recovery.</p>
                      <button
                        type="button"
                        className="account-link-button"
                        onClick={() => {
                          setResetToken(devResetToken);
                          setPassword("");
                          setPasswordConfirmation("");
                          setError(null);
                          setMode("reset-password");
                        }}
                      >
                        Open Local Reset Form
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="account-primary-button"
                onClick={() => void handleRequestPasswordReset()}
                disabled={busy}
              >
                Send Reset Link
              </button>
              <button
                type="button"
                className="account-link-button"
                onClick={() => {
                  setError(null);
                  setResetMessage(null);
                  setDevResetToken(null);
                  setMode("login");
                }}
              >
                Back To Sign In
              </button>
            </>
          ) : mode === "reset-password" ? (
            <>
              {resetToken.trim() ? (
                <p className="account-reset-hint">Enter a new password to finish recovery.</p>
              ) : (
                <label className="account-field">
                  <span>Reset token</span>
                  <input
                    value={resetToken}
                    autoComplete="one-time-code"
                    onChange={(event) => setResetToken(event.target.value)}
                  />
                </label>
              )}
              <label className="account-field">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  aria-describedby="account-password-help"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="account-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={passwordConfirmation}
                  autoComplete="new-password"
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                />
              </label>
              <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Use at least 8 characters with a letter and a number, symbol, or space.
              </p>
              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="account-primary-button"
                onClick={() => void handleConfirmPasswordReset()}
                disabled={busy}
              >
                Reset Password
              </button>
              <button
                type="button"
                className="account-link-button"
                onClick={() => {
                  setError(null);
                  setMode("login");
                }}
              >
                Back To Sign In
              </button>
            </>
          ) : (
            <>
              {mode === "register" ? (
                <label className="account-field">
                  <span>Display name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
              ) : null}
              <label className="account-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  aria-invalid={Boolean(error && mode === "register")}
                  onBlur={() => setEmail((current) => normalizeAccountEmail(current))}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {mode === "login" ? (
                <label className="account-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              ) : null}
              {mode === "login" ? (
                <button
                  type="button"
                  className="account-link-button justify-self-start"
                  onClick={() => {
                    setError(null);
                    setResetMessage(null);
                    setDevResetToken(null);
                    setMode("forgot-password");
                  }}
                >
                  Forgot Password?
                </button>
              ) : null}
              {mode === "register" ? (
                <p className="account-reset-hint">
                  We will email a one-time link. You will choose your password only after opening it, so nobody else can pre-register a password for your address.
                </p>
              ) : null}
              {error ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="account-primary-button" disabled={busy}>
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
              <button
                type="button"
                className="account-link-button"
                onClick={() => {
                  setError(null);
                  setMode("auth-choice");
                }}
              >
                Back To Options
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
