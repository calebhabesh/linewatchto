export type AccountDialogMode =
  | "auth-choice"
  | "login"
  | "register"
  | "verify-email"
  | "forgot-password"
  | "reset-password"
  | "link-google";

export type AccountEntryIntent = "login" | "register";

export const GOOGLE_LINK_SUCCESS_PARAM = "account_linked";
export const GOOGLE_LINK_SUCCESS_VALUE = "google";
export const GOOGLE_LINK_SUCCESS_MESSAGE = "Google sign-in has been linked to your account.";

export function currentBrowserLocalPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function googleLinkSuccessReturnTo(currentPath = currentBrowserLocalPath()): string {
  if (!currentPath.startsWith("/") || currentPath.startsWith("//") || currentPath.includes("\n") || currentPath.includes("\r")) {
    return `/?${GOOGLE_LINK_SUCCESS_PARAM}=${GOOGLE_LINK_SUCCESS_VALUE}`;
  }

  const url = new URL(currentPath, "https://linewatch.local");
  url.searchParams.delete("account_error");
  url.searchParams.set(GOOGLE_LINK_SUCCESS_PARAM, GOOGLE_LINK_SUCCESS_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function accountDialogTitle(mode: AccountDialogMode | null, entryIntent: AccountEntryIntent): string {
  switch (mode) {
    case "auth-choice":
      return entryIntent === "register" ? "Create Account" : "Sign In";
    case "link-google":
      return "Link Google";
    case "register":
      return "Create Account";
    case "verify-email":
      return "Verify Email";
    case "forgot-password":
      return "Reset password";
    case "reset-password":
      return "Choose new password";
    case "login":
    default:
      return "Sign In";
  }
}

export function accountDialogAriaLabel(mode: AccountDialogMode | null, entryIntent: AccountEntryIntent): string {
  switch (mode) {
    case "auth-choice":
      return entryIntent === "register"
        ? "Choose how to create a LineWatchTO account"
        : "Choose how to sign in to LineWatchTO";
    case "link-google":
      return "Link Google sign-in to LineWatchTO account";
    case "register":
      return "Create LineWatchTO account";
    case "verify-email":
      return "Verify your email for LineWatchTO";
    case "forgot-password":
      return "Reset LineWatchTO password";
    case "reset-password":
      return "Choose a new LineWatchTO password";
    case "login":
    default:
      return "Sign in to LineWatchTO";
  }
}

export function accountDialogDescription(mode: AccountDialogMode | null, entryIntent: AccountEntryIntent): string {
  if (mode === "auth-choice" && entryIntent === "login") {
    return "Sign in to access your saved stations and commutes, notification settings, and disruption impacts.";
  }
  if (mode === "verify-email") {
    return "Email verification protects account-owned commutes, stations, and notification settings.";
  }
  return "Create a free account to save stations and commutes, get push notifications, and track disruption impacts. All features are free.";
}

export type AccountDialogIntentOptions = {
  mode?: AccountDialogMode;
  entryIntent?: AccountEntryIntent;
  error?: string | null;
  successMessage?: string | null;
  initialToken?: string;
};
