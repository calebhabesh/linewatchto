"use client";

import { googleAuthStartUrl, type GoogleAuthMode } from "../app/account-data";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  label?: string;
  mode?: GoogleAuthMode;
  returnTo?: string;
  onError?: (message: string) => void;
};

export function GoogleSignInButton({
  disabled = false,
  label = "Continue With Google",
  mode = "login",
  returnTo,
  onError,
}: GoogleSignInButtonProps) {
  const handleClick = () => {
    if (disabled) {
      return;
    }
    try {
      window.location.assign(googleAuthStartUrl({ mode, returnTo }));
    } catch {
      onError?.("Google sign-in is unavailable.");
    }
  };

  return (
    <button
      type="button"
      className="account-choice-google-custom"
      disabled={disabled}
      onClick={handleClick}
    >
      <GoogleLogo />
      <span>{label}</span>
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="account-choice-google-icon" viewBox="0 0 24 24" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.44l-3.24-2.51c-.9.6-2.04.95-3.4.95-2.6 0-4.8-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.88a6.01 6.01 0 0 1 0-3.76V7.53H3.05a10 10 0 0 0 0 8.94l3.35-2.59z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.78.5 3.82 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.95 5.53l3.35 2.59C7.2 7.76 9.4 6 12 6z" />
    </svg>
  );
}
