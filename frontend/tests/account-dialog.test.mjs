import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountDialogTitle,
  accountDialogAriaLabel,
  accountDialogDescription,
  googleLinkSuccessReturnTo,
  GOOGLE_LINK_SUCCESS_PARAM,
  GOOGLE_LINK_SUCCESS_VALUE,
  GOOGLE_LINK_SUCCESS_MESSAGE,
} from "../src/components/account-dialog-state.ts";

describe("account dialog state helpers and contracts", () => {
  describe("accountDialogTitle", () => {
    it("renders Sign In for login auth-choice and login mode", () => {
      assert.equal(accountDialogTitle("auth-choice", "login"), "Sign In");
      assert.equal(accountDialogTitle("login", "login"), "Sign In");
    });

    it("renders Create Account for register auth-choice and register mode", () => {
      assert.equal(accountDialogTitle("auth-choice", "register"), "Create Account");
      assert.equal(accountDialogTitle("register", "register"), "Create Account");
    });

    it("renders specific titles for auxiliary recovery and verification modes", () => {
      assert.equal(accountDialogTitle("link-google", "login"), "Link Google");
      assert.equal(accountDialogTitle("verify-email", "login"), "Verify Email");
      assert.equal(accountDialogTitle("forgot-password", "login"), "Reset password");
      assert.equal(accountDialogTitle("reset-password", "login"), "Choose new password");
    });

    it("falls back to Sign In for null or default mode", () => {
      assert.equal(accountDialogTitle(null, "login"), "Sign In");
    });
  });

  describe("accountDialogAriaLabel", () => {
    it("renders descriptive accessible names for each mode", () => {
      assert.equal(accountDialogAriaLabel("auth-choice", "login"), "Choose how to sign in to LineWatchTO");
      assert.equal(accountDialogAriaLabel("auth-choice", "register"), "Choose how to create a LineWatchTO account");
      assert.equal(accountDialogAriaLabel("link-google", "login"), "Link Google sign-in to LineWatchTO account");
      assert.equal(accountDialogAriaLabel("register", "register"), "Create LineWatchTO account");
      assert.equal(accountDialogAriaLabel("verify-email", "login"), "Verify your email for LineWatchTO");
      assert.equal(accountDialogAriaLabel("forgot-password", "login"), "Reset LineWatchTO password");
      assert.equal(accountDialogAriaLabel("reset-password", "login"), "Choose a new LineWatchTO password");
      assert.equal(accountDialogAriaLabel("login", "login"), "Sign in to LineWatchTO");
      assert.equal(accountDialogAriaLabel(null, "login"), "Sign in to LineWatchTO");
    });
  });

  describe("accountDialogDescription", () => {
    it("renders benefits for sign in intent", () => {
      assert.match(
        accountDialogDescription("auth-choice", "login"),
        /Sign in to access your saved stations and commutes/,
      );
    });

    it("renders privacy protection description for email verification", () => {
      assert.match(
        accountDialogDescription("verify-email", "login"),
        /Email verification protects account-owned commutes/,
      );
    });

    it("renders free account benefits for registration intent and default modes", () => {
      assert.match(
        accountDialogDescription("auth-choice", "register"),
        /Create a free account to save stations and commutes.*All features are free\./,
      );
      assert.match(
        accountDialogDescription("register", "register"),
        /Create a free account to save stations and commutes.*All features are free\./,
      );
    });
  });

  describe("googleLinkSuccessReturnTo", () => {
    it("appends account_linked parameter to root path", () => {
      assert.equal(googleLinkSuccessReturnTo("/"), "/?account_linked=google");
    });

    it("preserves destination path, query params, and hash fragments", () => {
      assert.equal(
        googleLinkSuccessReturnTo("/commutes?tab=saved#details"),
        "/commutes?tab=saved&account_linked=google#details",
      );
    });

    it("removes prior account_error parameters", () => {
      assert.equal(
        googleLinkSuccessReturnTo("/?account_error=oauth_failed"),
        "/?account_linked=google",
      );
    });

    it("sanitizes protocol-relative open redirect vectors", () => {
      assert.equal(
        googleLinkSuccessReturnTo("//evil.com/phish"),
        "/?account_linked=google",
      );
    });

    it("sanitizes newline and CRLF injection attempts", () => {
      assert.equal(
        googleLinkSuccessReturnTo("/\r\nSet-Cookie:bad=1"),
        "/?account_linked=google",
      );
      assert.equal(
        googleLinkSuccessReturnTo("/\nSet-Cookie:bad=1"),
        "/?account_linked=google",
      );
    });

    it("falls back to root on non-root paths", () => {
      assert.equal(
        googleLinkSuccessReturnTo("javascript:alert(1)"),
        "/?account_linked=google",
      );
    });
  });

  describe("Google linking constants", () => {
    it("exports canonical parameter names and success messages", () => {
      assert.equal(GOOGLE_LINK_SUCCESS_PARAM, "account_linked");
      assert.equal(GOOGLE_LINK_SUCCESS_VALUE, "google");
      assert.equal(GOOGLE_LINK_SUCCESS_MESSAGE, "Google sign-in has been linked to your account.");
    });
  });
});
