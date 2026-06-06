import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("account UI source", () => {
  it("loads account state and exposes sign-in, create-account, demo, and sign-out actions", () => {
    assert.match(shellSource, /getCurrentAccount/);
    assert.match(shellSource, /loginAccount/);
    assert.match(shellSource, /registerAccount/);
    assert.match(shellSource, /loginDemoAccount/);
    assert.match(shellSource, /logoutAccount/);
    assert.match(shellSource, /Sign in/);
    assert.match(shellSource, /Create account/);
    assert.match(shellSource, /Demo account/);
    assert.match(shellSource, /Sign out/);
    assert.match(shellSource, /account-dialog/);
  });

  it("renders signed-out, demo, and account-backed saved commute states", () => {
    assert.match(savedCommutesSource, /accountState/);
    assert.match(savedCommutesSource, /accountCommutes/);
    assert.match(savedCommutesSource, /status-pill/);
    assert.match(savedCommutesSource, /matchedImpacts/);
    assert.match(savedCommutesSource, /Route path unavailable/);
    assert.doesNotMatch(savedCommutesSource, /Impact matching pending/);
    assert.match(savedCommutesSource, /createSavedCommute/);
    assert.match(savedCommutesSource, /deleteSavedCommute/);
  });

  it("does not show fixture demo commute cards for signed-out or empty account states", () => {
    assert.doesNotMatch(savedCommutesSource, /!\s*accountState\.authenticated\s*\|\|\s*accountCommutes\.length\s*===\s*0/);
    assert.doesNotMatch(savedCommutesSource, /commuteImpacts\.map/);
  });

  it("adds compact account styling without creating a landing page", () => {
    assert.match(globalCss, /\.account-dialog/);
    assert.match(globalCss, /\.account-action-row/);
    assert.match(globalCss, /\.saved-commute-form/);
    assert.doesNotMatch(shellSource, /hero|landing/i);
  });
});
