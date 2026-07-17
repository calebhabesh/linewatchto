import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const devBootstrapUrl = new URL("../src/components/LineWatchDevBootstrap.tsx", import.meta.url);
const devBootstrapSource = existsSync(devBootstrapUrl) ? readFileSync(devBootstrapUrl, "utf8") : "";
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const resetPasswordPageSource = readFileSync(new URL("../src/app/reset-password/page.tsx", import.meta.url), "utf8");
const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");
const googleSignInSource = readFileSync(new URL("../src/components/GoogleSignInButton.tsx", import.meta.url), "utf8");

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
    assert.match(shellSource, /getAuthConfig/);
    assert.match(shellSource, /GoogleSignInButton/);
    assert.match(shellSource, /Continue With Google/);
    assert.match(shellSource, /account-auth-divider/);
    assert.match(shellSource, /"link-google"/);
    assert.match(shellSource, /Link Google/);
    assert.match(shellSource, /Google Linked/);
    assert.match(shellSource, /"auth-choice"/);
    assert.match(shellSource, /type AccountEntryIntent = "login" \| "register"/);
    assert.match(shellSource, /openAuthChoice/);
    assert.match(shellSource, /Continue With Email/);
    assert.match(shellSource, /Back To Options/);
    assert.match(shellSource, /account-provider-stack/);
    assert.match(shellSource, /account-choice-primary/);
  });

  it("supports optional local dev account bootstrap without bypassing backend auth", () => {
    assert.equal(existsSync(devBootstrapUrl), true);
    assert.match(homePageSource, /LineWatchDevBootstrap/);
    assert.match(devBootstrapSource, /NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN/);
    assert.match(devBootstrapSource, /process\.env\.NODE_ENV === "development"/);
    assert.match(devBootstrapSource, /localhost/);
    assert.match(devBootstrapSource, /getCurrentAccount/);
    assert.match(devBootstrapSource, /loginDevAccount/);
    assert.match(devBootstrapSource, /<LineWatchShell initialData=\{initialData\} initialVisualPreferences=\{initialVisualPreferences\} \/>/);
  });

  it("surfaces Google OAuth callback errors through the account dialog", () => {
    assert.match(shellSource, /accountOAuthErrorState/);
    assert.match(shellSource, /params\.get\("account_error"\)/);
    assert.match(shellSource, /setAccountEntryIntent\(oauthErrorState\.entryIntent\)/);
    assert.match(shellSource, /setAccountDialogMode\(oauthErrorState\.dialogMode\)/);
    assert.match(shellSource, /setAccountError\(oauthErrorState\.message\)/);
    assert.match(shellSource, /nextParams\.delete\("account_error"\)/);
  });

  it("uses a clean success return path for Google account linking", () => {
    assert.match(shellSource, /GOOGLE_LINK_SUCCESS_PARAM/);
    assert.match(shellSource, /GOOGLE_LINK_SUCCESS_VALUE/);
    assert.match(shellSource, /params\.get\(GOOGLE_LINK_SUCCESS_PARAM\)/);
    assert.match(shellSource, /setAccountSuccessMessage\("Google sign-in has been linked to your account\."\)/);
    assert.match(shellSource, /nextParams\.delete\("account_error"\)/);
    assert.match(shellSource, /returnTo=\{googleLinkSuccessReturnTo\(\)\}/);
  });

  it("renders signed-out, demo, and account-backed saved commute states", () => {
    assert.match(savedCommutesSource, /accountState/);
    assert.match(savedCommutesSource, /accountCommutes/);
    assert.match(savedCommutesSource, /status-pill/);
    assert.match(savedCommutesSource, /matchedImpacts/);
    assert.match(savedCommutesSource, /formatTravelTimeHeadline/);
    assert.doesNotMatch(savedCommutesSource, /Impact matching pending/);
    assert.match(savedCommutesSource, /createSavedCommute/);
    assert.match(savedCommutesSource, /deleteSavedCommute/);
    assert.match(savedCommutesSource, /SavedCommuteStationPicker/);
    assert.match(savedCommutesSource, /aria-label="Sort saved commutes"/);
    assert.match(savedCommutesSource, /<option value="impact">Most Affected<\/option>/);
    assert.match(savedCommutesSource, /sortSavedCommutes/);
    assert.match(savedCommutesSource, /Track Return Route/);
    assert.match(savedCommutesSource, /watchReturnTrip/);
    assert.match(savedCommutesSource, /commute-leg-toggle/);
    assert.match(savedCommutesSource, /saved-commute-card-header/);
    assert.match(savedCommutesSource, /saved-commute-card-identity/);
    assert.match(savedCommutesSource, /saved-commute-current-impact-badge/);
    assert.match(
      globalCss,
      /\.saved-commute-card-header\s*\{(?=[^}]*align-items:\s*center;)(?=[^}]*display:\s*flex;)(?=[^}]*flex-wrap:\s*nowrap;)(?=[^}]*justify-content:\s*space-between;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-current-impact-badge\s*\{(?=[^}]*align-items:\s*center;)(?=[^}]*justify-content:\s*center;)(?=[^}]*min-height:\s*28px;)(?=[^}]*font-size:\s*0\.72rem;)(?=[^}]*line-height:\s*1;)[^}]*\}/s,
    );
    assert.match(savedCommutesSource, /To \{leg\.toStationName\}/);
    assert.match(savedCommutesSource, /Clear both ways/);
    assert.match(savedCommutesSource, /Return affected/);
    assert.match(savedCommutesSource, /Plotting route/);
    assert.match(savedCommutesSource, /Loader2/);
    assert.match(savedCommutesSource, /commute-route-stop-list/);
    assert.match(
      globalCss,
      /\.commute-route-actions \.commute-route-stop-toggle\s*\{(?=[^}]*gap:\s*0\.45rem;)(?=[^}]*justify-content:\s*flex-start;)(?=[^}]*letter-spacing:\s*0\.025em;)(?=[^}]*padding-left:\s*0;)[^}]*\}/s,
    );
    assert.match(globalCss, /\.commute-route-stop-toggle > svg\s*\{(?=[^}]*left:\s*-2px;)(?=[^}]*position:\s*relative;)[^}]*\}/s);
    assert.match(savedCommutesSource, /selectedLeg\.path\.stationIds/);
    assert.match(savedCommutesSource, /onViewPath/);
    assert.match(savedCommutesSource, /View path on map/);
    assert.match(savedCommutesSource, /<Trash2 size=\{22\} aria-hidden="true"/);
    assert.match(globalCss, /\.commute-route-delete-button svg\s*\{[^}]*height:\s*22px;[^}]*width:\s*22px;/s);
    assert.match(savedCommutesSource, /aria-label=\{`Delete saved commute \$\{commute\.label\}`\}/);
    assert.match(
      globalCss,
      /\.commute-route-delete-confirmation\s*\{(?=[^}]*justify-content:\s*center;)(?=[^}]*margin-left:\s*auto;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*30rem\)\s*\{[\s\S]*?\.commute-route-delete-confirmation\s*\{(?=[^}]*flex-basis:\s*100%;)(?=[^}]*justify-content:\s*flex-start;)(?=[^}]*width:\s*100%;)[^}]*\}\s*\.commute-route-delete-confirmation \.commute-route-delete-confirm-button\s*\{[^}]*margin-left:\s*auto !important;/s,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*30rem\)\s*\{(?=[\s\S]*?\.commute-route-actions\s*\{[^}]*gap:\s*0\.25rem;)(?=[\s\S]*?\.commute-route-actions \.commute-route-stop-toggle\s*\{[^}]*font-size:\s*0\.64rem;)(?=[\s\S]*?\.saved-commute-map-action,\s*\.commute-route-actions \.commute-route-map-button\s*\{[^}]*font-size:\s*0\.64rem;)/s,
    );
    assert.match(globalCss, /\.commute-route-delete-confirmation-prompt\s*\{(?=[^}]*left:\s*2px;)(?=[^}]*position:\s*relative;)[^}]*\}/s);
    assert.match(savedCommutesSource, /const deleteConfirmationRef = useRef<HTMLDivElement>\(null\)/);
    assert.match(savedCommutesSource, /window\.matchMedia\("\(max-width: 767px\)"\)\.matches/);
    assert.match(savedCommutesSource, /confirmation\.closest<HTMLElement>\("\.commute-grid"\)/);
    assert.match(savedCommutesSource, /const revealInset = 12/);
    assert.match(savedCommutesSource, /\(scrollContainer \?\? window\)\.scrollBy\(\{/);
    assert.match(savedCommutesSource, /prefers-reduced-motion: reduce/);
    assert.match(savedCommutesSource, /ref=\{deleteConfirmationRef\}/);
    assert.match(
      globalCss,
      /\.saved-commute-map-action\s*\{[^}]*background:[^;]+;[^}]*border-color:[^;]+;[^}]*box-shadow:[^;]+;[^}]*color:[^;]+;[^}]*\}/s,
    );
    assert.match(globalCss, /\.saved-commute-map-action:hover:not\(:disabled\)/);
    assert.match(globalCss, /\.saved-commute-map-action:focus-visible/);
    assert.match(savedCommutesSource, /onViewImpactOnPath/);
    assert.match(savedCommutesSource, /saved-commute-map-action saved-commute-impact-map-button/);
    assert.match(savedCommutesSource, /saved-commute-map-action commute-route-map-button/);
    assert.match(savedCommutesSource, /View on Map/);
    assert.match(shellSource, /handleViewCommuteImpactOnPath/);
    assert.match(globalCss, /\.saved-commute-map-action/);
  });

  it("renders saved commute extra-time estimates without claiming precision for major disruptions", () => {
    assert.match(savedCommutesSource, /travelTimeEstimate/);
    assert.match(savedCommutesSource, /formatEstimateDuration/);
    assert.match(savedCommutesSource, /function TravelTimeEstimateBlock/);
    assert.match(savedCommutesSource, /saved-commute-time-estimate/);
    assert.match(savedCommutesSource, /Travel Time/);
    assert.match(savedCommutesSource, /With Impacts/);
    assert.match(savedCommutesSource, /Extra Time/);
    assert.match(savedCommutesSource, /Confidence/);
    assert.match(savedCommutesSource, /Major disruption/);
    assert.match(savedCommutesSource, /function travelTimeSeverity/);
    assert.match(savedCommutesSource, /data-travel-time-severity/);
    assert.match(globalCss, /\.saved-commute-time-estimate/);
    assert.match(globalCss, /\.saved-commute-time-estimate\.unreliable/);
    assert.match(globalCss, /\.severity-good \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-decent \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-moderate \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-poor \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-severe \.saved-commute-time-verdict/);
    assert.match(savedCommutesSource, /saved-commute-time-headline-clock severity-\$\{selectedTravelTimeSeverity\}/);
    assert.match(globalCss, /\.saved-commute-time-headline-clock\.severity-good/);
    assert.match(globalCss, /\.saved-commute-time-headline-clock\.severity-severe/);
    assert.match(savedCommutesSource, /saved-commute-impact-icon/);
    assert.match(globalCss, /\.saved-commute-impact-icon\s*\{[^}]*align-items:\s*center;[^}]*height:\s*0\.875rem;/s);
    assert.match(globalCss, /\.saved-commute-impact-list\s*\{[^}]*gap:\s*0\.75rem;/s);
  });

  it("renders saved-commute granular notification controls inside the commute feature", () => {
    assert.match(savedCommutesSource, /updateSavedCommuteNotificationRule/);
    assert.match(savedCommutesSource, /Notify Me For This Route/);
    assert.match(savedCommutesSource, /Notification Days/);
    assert.match(savedCommutesSource, /Notification Window/);
    assert.match(savedCommutesSource, /Whole Route/);
    assert.match(savedCommutesSource, /Mon/);
    assert.match(savedCommutesSource, /Tue/);
    assert.match(savedCommutesSource, /Reduced Speed Zones/);
    assert.match(savedCommutesSource, /saved-commute-notification-rule/);
    assert.match(savedCommutesSource, /saved-commute-section-select/);
    assert.match(savedCommutesSource, /notificationRule/);
    assert.match(globalCss, /\.saved-commute-notification-rule/);
    assert.match(globalCss, /\.saved-commute-day-button/);
    assert.match(globalCss, /\.saved-commute-section-select/);
  });

  it("does not show fixture demo commute cards for signed-out or empty account states", () => {
    assert.doesNotMatch(savedCommutesSource, /!\s*accountState\.authenticated\s*\|\|\s*accountCommutes\.length\s*===\s*0/);
    assert.doesNotMatch(savedCommutesSource, /commuteImpacts\.map/);
  });

  it("adds compact account styling without creating a landing page", () => {
    assert.match(globalCss, /\.account-dialog/);
    assert.match(globalCss, /\.account-action-row/);
    assert.match(globalCss, /\.saved-commute-form/);
    assert.match(globalCss, /\.account-linked-status/);
    assert.match(globalCss, /\.account-provider-stack/);
    assert.match(globalCss, /\.account-choice-primary/);
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

  it("formats Sheppard-Yonge and Bloor-Yonge correctly with hyphen awareness", () => {
    const match = savedCommutesSource.match(/function toTitleCase\([\s\S]+?\n\}/);
    assert.ok(match, "toTitleCase function should exist in SavedCommutesPanel.tsx");
    // Strip TypeScript type annotations to run in plain Node
    const jsCode = match[0]
      .replace(/str:\s*string/g, "str")
      .replace(/:\s*string/g, "")
      .replace(/let formatted:\s*string;/g, "let formatted;");
    
    const toTitleCase = new Function(`return (${jsCode})`)();
    
    assert.equal(toTitleCase("sheppard-yonge"), "Sheppard-Yonge");
    assert.equal(toTitleCase("bloor-yonge"), "Bloor-Yonge");
    assert.equal(toTitleCase("Sheppard-Yonge to Finch"), "Sheppard-Yonge To Finch");
    assert.equal(toTitleCase("sheppard-yonge -> finch"), "Sheppard-Yonge -> Finch");
    assert.equal(toTitleCase("linewatch-lrt-ttc"), "LineWatch-LRT-TTC");
    assert.equal(toTitleCase("tmu"), "TMU");
  });

  it("uses a custom navigational Google provider button instead of the GIS iframe renderer", () => {
    assert.doesNotMatch(googleSignInSource, /accounts\.google\.com\/gsi\/client/);
    assert.doesNotMatch(googleSignInSource, /\.initialize\(/);
    assert.doesNotMatch(googleSignInSource, /\.renderButton\(/);
    assert.doesNotMatch(googleSignInSource, /onCredential/);
    assert.doesNotMatch(googleSignInSource, /clientId/);
    assert.doesNotMatch(googleSignInSource, /iframe/);
    assert.match(googleSignInSource, /googleAuthStartUrl/);
    assert.match(googleSignInSource, /window\.location\.assign/);
    assert.match(googleSignInSource, /account-choice-google-custom/);
    assert.match(globalCss, /\.account-auth-divider/);
  });

  it("keeps the custom Google button as the clickable surface", () => {
    assert.match(googleSignInSource, /account-choice-google-custom/);
    assert.doesNotMatch(googleSignInSource, /google-iframe-overlay-wrapper/);
    assert.match(globalCss, /\.account-choice-google-custom/);
    assert.doesNotMatch(globalCss, /\.google-iframe-overlay-wrapper/);
    assert.doesNotMatch(globalCss, /opacity:\s*0\.001/);
  });

  it("sizes the custom Google button to align with the email provider choice", () => {
    assert.match(globalCss, /\.account-choice-google-custom\s*\{[\s\S]*border-radius:\s*8px/);
    assert.match(globalCss, /\.account-choice-google-custom\s*\{[\s\S]*min-height:\s*44px/);
    assert.match(globalCss, /\.account-choice-google-custom\s*\{[\s\S]*width:\s*100%/);
  });

  it("uses a neutral shared provider-button surface for email and Google choices", () => {
    assert.match(globalCss, /\.account-choice-primary\s*\{[\s\S]*background:\s*rgb\(255,\s*255,\s*255\)/);
    assert.match(globalCss, /\.account-choice-primary\s*\{[\s\S]*border-radius:\s*8px/);
    assert.match(globalCss, /\.account-choice-primary\s*\{[\s\S]*color:\s*rgb\(31,\s*31,\s*31\)/);
    assert.match(globalCss, /\.account-choice-primary\s*\{[\s\S]*font-weight:\s*700/);
    assert.match(globalCss, /\.account-choice-google-custom\s*\{[\s\S]*background:\s*rgb\(255,\s*255,\s*255\)/);
  });
});
