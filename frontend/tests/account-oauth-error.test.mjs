import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountOAuthErrorState } from "../src/app/account-oauth-error.ts";

describe("account OAuth error handling", () => {
  it("turns same-email Google login conflicts into an email sign-in and link instruction", () => {
    assert.deepEqual(accountOAuthErrorState("google_account_link_required"), {
      dialogMode: "auth-choice",
      entryIntent: "login",
      message: "A LineWatchTO account already exists for that Google email. Sign in with email and password, then link Google from Account.",
    });
  });

  it("turns generic Google OAuth failures into a retryable sign-in message", () => {
    assert.deepEqual(accountOAuthErrorState("google_oauth_failed"), {
      dialogMode: "auth-choice",
      entryIntent: "login",
      message: "Could not complete Google sign-in. Try again.",
    });
  });

  it("uses the retryable Google sign-in message for unknown non-blank account error codes", () => {
    assert.deepEqual(accountOAuthErrorState("unknown_error"), {
      dialogMode: "auth-choice",
      entryIntent: "login",
      message: "Could not complete Google sign-in. Try again.",
    });
  });

  it("ignores blank account error codes", () => {
    assert.equal(accountOAuthErrorState(""), null);
    assert.equal(accountOAuthErrorState(null), null);
  });
});
