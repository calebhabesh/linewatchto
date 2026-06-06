import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAccountEmail,
  validateAccountCredentials,
} from "../src/app/account-validation.ts";

describe("account validation", () => {
  it("normalizes emails before account requests", () => {
    assert.equal(normalizeAccountEmail(" Rider@Example.COM "), "rider@example.com");
  });

  it("accepts simple valid registration inputs", () => {
    const result = validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "correct horse battery staple",
    });

    assert.equal(result.valid, true);
    assert.equal(result.normalizedEmail, "rider@example.com");
  });

  it("rejects malformed emails", () => {
    const result = validateAccountCredentials({
      mode: "register",
      email: "rider@localhost",
      password: "correct horse battery staple",
    });

    assert.equal(result.valid, false);
    assert.equal(result.message, "Enter a valid email address.");
  });

  it("keeps registration password rules easy but useful", () => {
    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "short1",
    }).message, "Password must be at least 8 characters.");

    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "1234567890!",
    }).message, "Password must include at least one letter.");

    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "aaaaaaaaaa",
    }).message, "Password must include a number, symbol, or space.");
  });

  it("does not apply new-password rules to login", () => {
    const result = validateAccountCredentials({
      mode: "login",
      email: "rider@example.com",
      password: "legacy",
    });

    assert.equal(result.valid, true);
  });
});
