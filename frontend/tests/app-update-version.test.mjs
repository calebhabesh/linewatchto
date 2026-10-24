import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appUpdateReleaseNote,
  appUpdateNewVersion,
  appUpdateReleaseKey,
  isQuietUpdateMoment,
  QUIET_UPDATE_WINDOW_MS,
  shouldApplyBackgroundUpdate,
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

  it("does not show an update when only the build label changes inside the same app version", () => {
    assert.equal(
      shouldShowAppUpdate(
        { appVersion: "1.0.0", buildLabel: "prod-abcdef123456" },
        { appVersion: "1.0.0", buildLabel: "prod-111111111111" },
      ),
      false,
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

  it("uses the app version for update dismissal storage", () => {
    assert.equal(
      appUpdateReleaseKey({ appVersion: "1.0.0", buildLabel: "prod-abcdef123456" }),
      "version:1.0.0",
    );
  });

  it("uses release copy only for a matching new app version", () => {
    const releaseNote = { version: "1.1.0", title: "A new way to explore", summary: "New map", sections: [] };
    const installed = { appVersion: "1.1.0", buildLabel: "prod-old" };

    assert.equal(appUpdateReleaseNote({ appVersion: "1.1.0", buildLabel: "prod-new", releaseNote }, installed), null);
    assert.equal(appUpdateNewVersion({ appVersion: "1.1.0", buildLabel: "prod-new" }, installed), null);
    assert.equal(appUpdateReleaseNote({ appVersion: "1.1.1", releaseNote }, installed), null);
    assert.equal(appUpdateNewVersion({ appVersion: "1.1.1" }, installed), "1.1.1");
    assert.equal(appUpdateReleaseNote({ appVersion: "1.2.0", releaseNote: { ...releaseNote, version: "1.2.0" } }, installed)?.version, "1.2.0");
  });
});

describe("background build updates", () => {
  it("applies a new deploy of the same app version silently", () => {
    assert.equal(
      shouldApplyBackgroundUpdate(
        { appVersion: "1.1.0", buildLabel: "prod-abcdef123456" },
        { appVersion: "1.1.0", buildLabel: "prod-111111111111" },
      ),
      true,
    );
  });

  it("leaves app version changes to the update banner", () => {
    assert.equal(
      shouldApplyBackgroundUpdate(
        { appVersion: "1.2.0", buildLabel: "prod-abcdef123456" },
        { appVersion: "1.1.0", buildLabel: "prod-111111111111" },
      ),
      false,
    );
  });

  it("ignores matching, missing, and unversioned local build labels", () => {
    const installed = { appVersion: "1.1.0", buildLabel: "prod-111111111111" };
    assert.equal(shouldApplyBackgroundUpdate({ appVersion: "1.1.0", buildLabel: "prod-111111111111" }, installed), false);
    assert.equal(shouldApplyBackgroundUpdate({ appVersion: "1.1.0" }, installed), false);
    assert.equal(shouldApplyBackgroundUpdate({ buildLabel: "prod-abcdef123456" }, installed), false);
    assert.equal(shouldApplyBackgroundUpdate({ appVersion: "1.1.0", buildLabel: "local" }, installed), false);
    assert.equal(shouldApplyBackgroundUpdate({ appVersion: "1.1.0", buildLabel: "prod-abcdef123456" }, { appVersion: "1.1.0", buildLabel: "dev" }), false);
  });

  it("reloads only shortly after launch or resume and before any interaction", () => {
    const foregroundStartedAt = 10_000;
    assert.equal(isQuietUpdateMoment({ now: 10_400, foregroundStartedAt, lastInteractionAt: Number.NEGATIVE_INFINITY }), true);
    assert.equal(isQuietUpdateMoment({ now: 10_400, foregroundStartedAt, lastInteractionAt: 4_000 }), true);
    assert.equal(isQuietUpdateMoment({ now: 10_400, foregroundStartedAt, lastInteractionAt: 10_200 }), false);
    assert.equal(
      isQuietUpdateMoment({ now: foregroundStartedAt + QUIET_UPDATE_WINDOW_MS + 1, foregroundStartedAt, lastInteractionAt: 0 }),
      false,
    );
  });
});
