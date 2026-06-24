import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appUpdateReleaseKey,
  shouldShowAppUpdate,
} from "../src/app/app-update-version.ts";

describe("app update release identity", () => {
  it("shows an update when the app version changes even if the build label is reused", () => {
    assert.equal(
      shouldShowAppUpdate(
        { appVersion: "1.0.0", buildLabel: "staging-local" },
        { appVersion: "0.1.0", buildLabel: "staging-local" },
      ),
      true,
    );
  });

  it("shows an update when the build label changes inside the same app version", () => {
    assert.equal(
      shouldShowAppUpdate(
        { appVersion: "1.0.0", buildLabel: "prod-abcdef123456" },
        { appVersion: "1.0.0", buildLabel: "prod-111111111111" },
      ),
      true,
    );
  });

  it("does not show an update when both release identity parts match", () => {
    assert.equal(
      shouldShowAppUpdate(
        { appVersion: "1.0.0", buildLabel: "prod-abcdef123456" },
        { appVersion: "1.0.0", buildLabel: "prod-abcdef123456" },
      ),
      false,
    );
  });

  it("uses the same composite key for update dismissal storage", () => {
    assert.equal(
      appUpdateReleaseKey({ appVersion: "1.0.0", buildLabel: "prod-abcdef123456" }),
      "version:1.0.0|build:prod-abcdef123456",
    );
  });
});
