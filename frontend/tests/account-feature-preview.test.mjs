import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const commutes = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const stations = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("signed-out account feature previews", () => {
  it("uses one card treatment for Notifications, My Commutes, and My Stations", () => {
    assert.match(notifications, /account-feature-preview notification-settings-prompt/);
    assert.match(commutes, /account-feature-preview saved-commute-account-prompt/);
    assert.match(stations, /account-feature-preview saved-commute-account-prompt/);
    assert.match(styles, /\.account-feature-preview\s*\{[^}]*padding:\s*1rem !important;/s);
    assert.match(styles, /\.dark \.account-feature-preview\s*\{[^}]*background:\s*#151821 !important;/s);
    assert.match(styles, /\.saved-commute-account-prompt:not\(\.account-feature-preview\)/);
  });
});
