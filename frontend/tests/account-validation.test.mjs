import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAccountEmail,
  validateAccountEmail,
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

  it("validates a registration email before password creation", () => {
    assert.deepEqual(validateAccountEmail(" Rider@Example.COM "), {
      valid: true,
      normalizedEmail: "rider@example.com",
      message: null,
    });
    assert.equal(validateAccountEmail("rider@localhost").message, "Enter a valid email address.");
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

    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: `${"é".repeat(40)}1a`,
    }).message, "Password must be 72 UTF-8 bytes or less.");
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
