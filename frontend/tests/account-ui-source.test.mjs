import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const resetPasswordPageSource = readFileSync(new URL("../src/app/reset-password/page.tsx", import.meta.url), "utf8");
const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");

describe("account UI source", () => {
  it("loads account state and exposes sign-in, create-account, demo, and sign-out actions", () => {
    assert.match(shellSource, /getCurrentAccount/);
    assert.match(shellSource, /loginAccount/);
    assert.match(shellSource, /registerAccount/);
    assert.match(shellSource, /loginDemoAccount/);
    assert.match(shellSource, /logoutAccount/);
    assert.match(shellSource, /Sign In/);
    assert.match(shellSource, /Create Account/);
    assert.match(shellSource, /Demo Account/);
    assert.match(shellSource, /Sign Out/);
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
    assert.match(savedCommutesSource, /SavedCommuteStationPicker/);
    assert.doesNotMatch(savedCommutesSource, /<select/);
    assert.match(savedCommutesSource, /Track Return Route/);
    assert.match(savedCommutesSource, /watchReturnTrip/);
    assert.match(savedCommutesSource, /commute-leg-toggle/);
    assert.match(savedCommutesSource, /To \{leg\.toStationName\}/);
    assert.match(savedCommutesSource, /Clear both ways/);
    assert.match(savedCommutesSource, /Return affected/);
    assert.match(savedCommutesSource, /Plotting route/);
    assert.match(savedCommutesSource, /Loader2/);
    assert.match(savedCommutesSource, /commute-route-stop-list/);
    assert.match(savedCommutesSource, /selectedLeg\.path\.stationIds/);
    assert.match(savedCommutesSource, /onViewPath/);
    assert.match(savedCommutesSource, /View path on map/);
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

  it("defines a compact saved-commute station picker using station search helpers", () => {
    assert.match(savedCommutePickerSource, /searchStations/);
    assert.match(savedCommutePickerSource, /buildStationLineGroups/);
    assert.match(savedCommutePickerSource, /commute-station-picker/);
    assert.match(savedCommutePickerSource, /role="searchbox"/);
    assert.match(savedCommutePickerSource, /aria-haspopup="listbox"/);
    assert.match(globalCss, /\.commute-station-picker/);
    assert.match(globalCss, /\.commute-station-popover/);
  });

  it("validates create-account input before sending registration requests", () => {
    assert.match(shellSource, /validateAccountCredentials/);
    assert.match(shellSource, /normalizeAccountEmail/);
    assert.match(shellSource, /account-error-live/);
    assert.match(shellSource, /autoComplete=\{accountDialogMode === "login" \? "current-password" : "new-password"\}/);
    assert.match(shellSource, /aria-invalid=\{Boolean\(accountError && accountDialogMode === "register"\)\}/);
    assert.match(shellSource, /Use at least 8 characters with a letter and a number, symbol, or space\./);
    assert.match(shellSource, /error instanceof AccountRequestError/);
  });

  it("uses standard HTML form element with submit button for enter-key submission support", () => {
    assert.match(shellSource, /<form/);
    assert.match(shellSource, /onSubmit=\{/);
    assert.match(shellSource, /event\.preventDefault\(\)/);
    assert.match(shellSource, /handleSubmitAccount\(\)/);
    assert.match(shellSource, /<button type="submit" className="account-primary-button"/);
  });

  it("renders forgot-password and reset-password states inside the sign-in dialog", () => {
    assert.match(shellSource, /"forgot-password"/);
    assert.match(shellSource, /"reset-password"/);
    assert.match(shellSource, /Forgot Password\?/);
    assert.match(shellSource, /Send Reset Link/);
    assert.match(shellSource, /Open Local Reset Form/);
    assert.match(shellSource, /Local dev mode: no email was sent/);
    assert.match(shellSource, /Reset Password/);
    assert.match(shellSource, /Back To Sign In/);
    assert.match(shellSource, /requestPasswordReset/);
    assert.match(shellSource, /confirmPasswordReset/);
    assert.match(shellSource, /accountResetToken/);
    assert.match(shellSource, /accountPasswordConfirmation/);
    assert.match(globalCss, /\.account-link-button/);
    assert.match(globalCss, /\.account-reset-status/);
    assert.match(globalCss, /\.account-reset-dev-note/);
    assert.match(globalCss, /\.account-reset-hint/);
  });

  it("supports emailed reset links through a reset-password route", () => {
    assert.match(dashboardDataSource, /loadDashboardInitialData/);
    assert.match(homePageSource, /loadDashboardInitialData/);
    assert.match(resetPasswordPageSource, /searchParams/);
    assert.match(resetPasswordPageSource, /initialPasswordResetToken/);
    assert.match(resetPasswordPageSource, /decodeResetTokenParam/);
    assert.match(shellSource, /initialPasswordResetToken/);
    assert.match(shellSource, /accountDialogMode.*initialPasswordResetToken.*"reset-password"/s);
    assert.match(shellSource, /accountResetToken.*initialPasswordResetToken/s);
  });
});
