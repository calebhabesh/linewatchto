export type AccountOAuthErrorState = {
  dialogMode: "auth-choice";
  entryIntent: "login";
  message: string;
};

const accountOAuthErrorMessages: Record<string, string> = {
  google_account_link_required:
    "A LineWatchTO account already exists for that Google email. Sign in with email and password, then link Google from Account.",
  google_already_linked: "This LineWatch account is already linked to a different Google account.",
  google_email_mismatch: "That Google account email does not match your signed-in LineWatch account.",
  google_email_unverified: "Google says that email is not verified. Verify it with Google before signing in.",
  google_identity_in_use: "That Google account is already linked to another LineWatch account.",
  google_link_demo_account: "Demo accounts cannot link Google sign-in.",
  google_oauth_failed: "Could not complete Google sign-in. Try again.",
  invalid_google_oauth_mode: "Google sign-in mode is invalid. Try again.",
};

export function accountOAuthErrorState(errorCode: string | null | undefined): AccountOAuthErrorState | null {
  const code = errorCode?.trim();
  if (!code) {
    return null;
  }

  const message = accountOAuthErrorMessages[code] ?? accountOAuthErrorMessages.google_oauth_failed;

  return {
    dialogMode: "auth-choice",
    entryIntent: "login",
    message,
  };
}
