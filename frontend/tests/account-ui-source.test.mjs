import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import { toTitleCase } from "../src/app/text-format.ts";

const devBootstrapUrl = new URL("../src/components/LineWatchDevBootstrap.tsx", import.meta.url);
const devBootstrapSource = existsSync(devBootstrapUrl) ? readFileSync(devBootstrapUrl, "utf8") : "";
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const resetPasswordPageSource = readFileSync(new URL("../src/app/reset-password/page.tsx", import.meta.url), "utf8");
const verifyEmailPageSource = readFileSync(new URL("../src/app/verify-email/page.tsx", import.meta.url), "utf8");
const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const savedCommuteCardSource = readFileSync(new URL("../src/components/SavedCommuteCard.tsx", import.meta.url), "utf8");
const savedCommuteEditorSource = readFileSync(new URL("../src/components/SavedCommuteNotificationRuleEditor.tsx", import.meta.url), "utf8");
const savedCommuteDraftSource = readFileSync(new URL("../src/components/SavedCommuteRouteDraftEditor.tsx", import.meta.url), "utf8");
const editModelSource = readFileSync(new URL("../src/app/commute-notification-edit-model.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");
const googleSignInSource = readFileSync(new URL("../src/components/GoogleSignInButton.tsx", import.meta.url), "utf8");
const accountAvailabilitySource = readFileSync(new URL("../src/components/AccountAvailabilityNotice.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const notificationSettingsSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
const myStationsSource = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const accountDialogSource = readFileSync(new URL("../src/components/AccountDialog.tsx", import.meta.url), "utf8");
const accountDialogStateSource = readFileSync(new URL("../src/components/account-dialog-state.ts", import.meta.url), "utf8");
const accountSessionSource = readFileSync(new URL("../src/hooks/useAccountSession.ts", import.meta.url), "utf8");

describe("account UI source", () => {
  it("loads account state and exposes sign-in, create-account, demo, and sign-out actions", () => {
    assert.match(accountSessionSource, /getCurrentAccount/);
    assert.match(accountDialogSource, /loginAccount/);
    assert.match(accountDialogSource, /registerAccount/);
    assert.match(accountSessionSource, /loginDemoAccount/);
    assert.match(accountSessionSource, /logoutAccount/);
    assert.match(shellSource, /Sign In/);
    assert.match(shellSource, /Create Account/);
    assert.match(shellSource, /Demo Account/);
    assert.match(shellSource, /Sign Out/);
    assert.match(shellSource, /AccountDialog/);
    assert.match(accountDialogSource, /account-dialog/);
    assert.match(accountSessionSource, /getAuthConfig/);
    assert.match(accountDialogSource, /GoogleSignInButton/);
    assert.match(accountDialogSource, /Continue With Google/);
    assert.match(accountDialogSource, /account-auth-divider/);
    assert.match(accountDialogSource, /"link-google"/);
    assert.match(accountDialogSource, /Link Google/);
    assert.match(shellSource, /Google Linked/);
    assert.match(accountDialogSource, /"auth-choice"/);
    assert.match(accountDialogStateSource, /type AccountEntryIntent = "login" \| "register"/);
    assert.match(accountDialogSource, /AccountEntryIntent/);
    assert.match(shellSource, /openAuthChoice/);
    assert.match(accountDialogSource, /Continue With Email/);
    assert.match(accountDialogSource, /Back To Options/);
    assert.match(accountDialogSource, /account-provider-stack/);
    assert.match(accountDialogSource, /account-choice-primary/);
    assert.ok(
      accountDialogSource.indexOf('aria-label="Continue With Google"')
        < accountDialogSource.indexOf("Continue With Email"),
      "Google should be presented before email in the authentication choice dialog",
    );
    assert.match(accountDialogStateSource, /Create a free account[^<]*All features are free\./);
    assert.match(accountDialogStateSource, /Sign in to access your saved stations and commutes/);
    assert.doesNotMatch(accountDialogStateSource, /Welcome back/);
    assert.doesNotMatch(accountDialogStateSource, /Your account and all features are free\./);
    assert.match(accountDialogSource, /account-dialog-header/);
    assert.match(accountDialogSource, /account-dialog-description/);
  });

  it("keeps account outages distinct from signed-out state and retries automatically", () => {
    assert.match(accountSessionSource, /getCurrentAccountWithRetry/);
    assert.match(accountSessionSource, /preserveAccountStateDuringOutage/);
    assert.match(accountSessionSource, /addEventListener\("online"/);
    assert.match(accountSessionSource, /addEventListener\("visibilitychange"/);
    assert.match(shellSource, /accountState\.source === "unavailable"/);
    assert.match(accountAvailabilitySource, /Your sign-in has not been cleared/);
    assert.match(accountAvailabilitySource, /retrying automatically/);
    assert.match(savedCommutesSource, /AccountAvailabilityNotice/);
    assert.match(myStationsSource, /AccountAvailabilityNotice/);
    assert.match(notificationSettingsSource, /AccountAvailabilityNotice/);
    assert.match(mobileMoreSource, /AccountAvailabilityNotice/);
  });

  it("routes signed-out station saves to account creation without a redundant error", () => {
    assert.doesNotMatch(shellSource, /Sign in to save stations\./);
    assert.match(
      shellSource,
      /if \(!accountState\.authenticated\) \{\s*openAuthChoice\("register"\);\s*return false;\s*\}/,
    );
    assert.match(accountDialogSource, /className="account-dialog-close"/);
    assert.match(globalCss, /\.account-dialog-close\s*\{[^}]*flex:\s*0 0 36px;[^}]*-webkit-tap-highlight-color:\s*transparent;/s);
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
    assert.match(shellSource, /openAccountDialog\(\{[\s\S]*mode:\s*oauthErrorState\.dialogMode[\s\S]*entryIntent:\s*oauthErrorState\.entryIntent[\s\S]*error:\s*oauthErrorState\.message/);
    assert.match(shellSource, /nextParams\.delete\("account_error"\)/);
  });

  it("uses a clean success return path for Google account linking", () => {
    assert.match(shellSource, /GOOGLE_LINK_SUCCESS_PARAM/);
    assert.match(shellSource, /GOOGLE_LINK_SUCCESS_VALUE/);
    assert.match(shellSource, /params\.get\(GOOGLE_LINK_SUCCESS_PARAM\)/);
    assert.match(shellSource, /openAccountDialog\(\{[\s\S]*mode:\s*"link-google"[\s\S]*successMessage:\s*GOOGLE_LINK_SUCCESS_MESSAGE/);
    assert.match(shellSource, /nextParams\.delete\("account_error"\)/);
    assert.match(accountDialogSource, /returnTo=\{googleLinkSuccessReturnTo\(\)\}/);
  });

  it("renders signed-out, demo, and account-backed saved commute states", () => {
    assert.match(savedCommutesSource, /accountState/);
    assert.match(savedCommutesSource, /accountCommutes/);
    assert.match(savedCommuteCardSource, /status-pill/);
    assert.match(savedCommuteCardSource, /matchedImpacts/);
    assert.doesNotMatch(savedCommuteCardSource, /matchedImpacts\.slice\(0,\s*3\)/);
    assert.match(savedCommuteCardSource, /formatTravelTimeHeadline/);
    assert.doesNotMatch(savedCommuteCardSource, /Impact matching pending/);
    assert.match(savedCommutesSource, /createSavedCommute/);
    assert.match(savedCommutesSource, /deleteSavedCommute/);
    assert.match(savedCommuteDraftSource, /SavedCommuteStationPicker/);
    assert.match(savedCommutesSource, /<ToolbarSelectMenu/);
    assert.match(savedCommutesSource, /ariaLabel="Sort My Commutes"/);
    assert.match(savedCommutesSource, /COMMUTE_SORT_OPTIONS/);
    assert.match(savedCommutesSource, /sortSavedCommutes/);
    assert.match(savedCommuteDraftSource, /Track Return Route/);
    assert.match(savedCommuteDraftSource, /watchReturnTrip/);
    assert.match(savedCommuteCardSource, /commute-leg-toggle/);
    assert.match(savedCommuteCardSource, /saved-commute-card-header/);
    assert.match(savedCommuteCardSource, /saved-commute-card-identity/);
    assert.match(savedCommuteCardSource, /saved-commute-current-impact-badge/);
    assert.match(savedCommuteCardSource, /saved-commute-endpoints/);
    assert.match(savedCommuteCardSource, /saved-commute-endpoint-prefix">Origin:<\/span>/);
    assert.match(savedCommuteCardSource, /saved-commute-endpoint-prefix">Destination:<\/span>/);
    assert.match(savedCommuteCardSource, /CommuteOriginIcon/);
    assert.match(savedCommuteCardSource, /CommuteDestinationPinIcon/);
    assert.match(savedCommuteCardSource, /CommuteConnectingDots/);
    assert.match(
      globalCss,
      /\.saved-commute-card-header\s*\{(?=[^}]*align-items:\s*flex-start;)(?=[^}]*display:\s*flex;)(?=[^}]*flex-wrap:\s*nowrap;)(?=[^}]*justify-content:\s*space-between;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-current-impact-badge\s*\{(?=[^}]*align-items:\s*center;)(?=[^}]*justify-content:\s*center;)(?=[^}]*min-height:\s*28px;)(?=[^}]*font-size:\s*0\.72rem;)(?=[^}]*line-height:\s*1;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-endpoints\s*\{(?=[^}]*display:\s*flex)(?=[^}]*flex-direction:\s*column)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-endpoint-row\s*\{(?=[^}]*align-items:\s*center;)(?=[^}]*display:\s*flex)(?=[^}]*gap:\s*0\.5rem;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-endpoint-prefix\s*\{(?=[^}]*font-family:\s*var\(--font-sans\))(?=[^}]*font-weight:\s*800;)(?=[^}]*text-transform:\s*uppercase;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-origin-swap\s*\{(?=[^}]*animation:[^}]*commuteOriginSwapIn)/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-dest-swap\s*\{(?=[^}]*animation:[^}]*commuteDestSwapIn)/s,
    );
    assert.match(globalCss, /@keyframes commuteOriginSwapIn/);
    assert.match(globalCss, /@keyframes commuteDestSwapIn/);
    assert.match(savedCommuteCardSource, /saved-commute-origin-swap/);
    assert.match(savedCommuteCardSource, /onToggleLeg\([\s\S]*?commute\.id,\s*leg\.id,\s*selectedLeg\.id\)/);
    assert.match(savedCommutesSource, /handleToggleLeg/);
    assert.match(savedCommutesSource, /clearCommuteSwapAnimation/);
    assert.match(savedCommuteCardSource, /onAnimationEnd=\{[\s\S]*?commuteOriginSwapIn[\s\S]*?onClearSwapAnimation/);
    assert.match(savedCommuteCardSource, /onAnimationEnd=\{[\s\S]*?commuteDestSwapIn[\s\S]*?onClearSwapAnimation/);
    assert.match(savedCommuteCardSource, /To \{leg\.toStationName\}/);
    assert.match(savedCommuteCardSource, /Clear both ways/);
    assert.match(savedCommuteCardSource, /Return affected/);
    assert.match(savedCommuteDraftSource, /Plotting route/);
    assert.match(savedCommuteDraftSource, /Loader2/);
    assert.match(savedCommuteCardSource, /commute-route-stop-list/);
    assert.match(
      globalCss,
      /\.commute-route-actions \.commute-route-stop-toggle\s*\{(?=[^}]*gap:\s*0\.42rem;)(?=[^}]*justify-content:\s*center;)(?=[^}]*letter-spacing:\s*0\.015em;)[^}]*\}/s,
    );
    assert.match(savedCommuteCardSource, /<SquarePen size=\{16\}[^>]*\/>[\s\S]*?Edit Route/);
    assert.match(savedCommuteCardSource, /View \$\{routeStops\.length\} Stops`\}[\s\S]*?<ChevronDown size=\{16\}/);
    assert.match(savedCommuteCardSource, /selectedLeg\.path\.stationIds/);
    assert.match(savedCommutesSource, /onViewPath/);
    assert.match(savedCommuteCardSource, /commute-route-map-button[\s\S]*?View on Map/);
    assert.match(savedCommuteDraftSource, /saved-commute-edit-delete-button/);
    assert.match(savedCommuteDraftSource, /Delete this commute/);
    assert.match(savedCommuteDraftSource, /saved-commute-delete-confirm-box/);
    assert.match(globalCss, /\.saved-commute-edit-delete-button\s*\{(?=[^}]*font-weight:\s*850;)(?=[^}]*text-transform:\s*uppercase;)(?=[^}]*letter-spacing:\s*0\.025em;)[^}]*\}/s);
    assert.match(globalCss, /\.saved-commute-delete-confirm-prompt\s*\{(?=[^}]*font-weight:\s*850;)(?=[^}]*text-transform:\s*uppercase;)[^}]*\}/s);
    assert.match(globalCss, /@media \(max-width:\s*30rem\)\s*\{[\s\S]*?\.commute-card\s*\{(?=[^}]*max-width:\s*100%;)(?=[^}]*overflow-x:\s*hidden;)(?=[^}]*width:\s*100%;)[^}]*\}/s);
    assert.match(
      globalCss,
      /@media \(max-width:\s*30rem\)\s*\{(?=[\s\S]*?\.commute-route-actions\s*\{[^}]*gap:\s*0\.25rem;)(?=[\s\S]*?\.commute-route-actions \.commute-route-stop-toggle\s*\{[^}]*font-size:\s*0\.72rem;)(?=[\s\S]*?\.saved-commute-map-action,\s*\.commute-route-actions \.commute-route-map-button\s*\{[^}]*font-size:\s*0\.66rem;)/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-map-action\s*\{[^}]*background:[^;]+;[^}]*border-color:[^;]+;[^}]*box-shadow:[^;]+;[^}]*color:[^;]+;[^}]*\}/s,
    );
    assert.match(globalCss, /\.saved-commute-map-action:hover:not\(:disabled\)/);
    assert.match(globalCss, /\.saved-commute-map-action:focus-visible/);
    assert.match(savedCommutesSource, /onViewImpactOnPath/);
    assert.match(savedCommuteCardSource, /saved-commute-map-action saved-commute-impact-map-button/);
    assert.match(savedCommuteCardSource, /saved-commute-map-action commute-route-map-button/);
    assert.match(savedCommuteCardSource, /View on Map/);
    assert.match(shellSource, /handleViewCommuteImpactOnPath/);
    assert.match(shellSource, /viewForSavedCommuteImpact/);
    assert.match(shellSource, /resolveCommuteImpactMapSelection\([\s\S]*?impact,[\s\S]*?commuteDashboard\.activeAlerts,[\s\S]*?commuteNetwork,/);
    assert.match(globalCss, /\.saved-commute-map-action/);
  });

  it("keeps ignored route impacts visible without treating filters as physical conditions", () => {
    assert.match(savedCommuteCardSource, /Clear by filters/);
    assert.match(savedCommuteCardSource, /Ignored by Route Filter/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-ignored/);
    assert.match(savedCommuteCardSource, /leg-btn-filtered/);
    assert.doesNotMatch(savedCommuteCardSource, /Ignored By Route Alert Filters/);
    assert.match(globalCss, /\.saved-commute-impact-ignored/);
    assert.match(globalCss, /\.commute-leg-toggle button\.leg-btn-filtered/);
    assert.match(globalCss, /text-decoration:\s*line-through/);
  });

  it("collapses saved-commute disruptions behind alert-type summary chips", () => {
    assert.match(savedCommuteCardSource, /<details[\s\S]*?className="saved-commute-impact-disclosure"/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-summary-chips/);
    assert.match(savedCommuteCardSource, /summarizeMatchedImpacts/);
    assert.match(savedCommuteCardSource, /<summary className="saved-commute-impact-summary">/);
    assert.match(globalCss, /\.saved-commute-impact-disclosure/);
    assert.match(globalCss, /\.saved-commute-impact-summary-chip/);
    assert.match(globalCss, /\.saved-commute-impact-disclosure\[open\]/);
    assert.match(globalCss, /\.saved-commute-impact-disclosure\s*\{(?=[^}]*border-bottom:)(?=[^}]*border-top:)[^}]*\}/s);
    assert.doesNotMatch(
      globalCss,
      /\.saved-commute-impact-summary-icon\s*\{[^}]*transform:\s*translateY\(/s,
    );
    assert.match(
      globalCss,
      /\.saved-commute-impact-total\s*\{(?=[^}]*color:\s*#334155;)(?=[^}]*font-variant-numeric:\s*tabular-nums;)(?=[^}]*margin-left:\s*2px;)(?=[^}]*min-width:\s*1\.4rem;)(?=[^}]*padding:\s*0 0\.34rem;)(?=[^}]*width:\s*auto;)[^}]*\}/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.saved-commute-impact-total\s*\{[^}]*transform:\s*translateY\(/s,
    );
    assert.match(savedCommuteCardSource, /saved-commute-impact-summary-action-collapsed">List View/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-summary-action-expanded">Hide List/);
    assert.match(globalCss, /\.saved-commute-impact-summary-action\s*\{(?=[^}]*align-self:\s*flex-start;)(?=[^}]*justify-self:\s*end;)[^}]*\}/s);
    assert.match(
      globalCss,
      /@media \(max-width:\s*30rem\)\s*\{(?=[\s\S]*?\.saved-commute-impact-summary-heading strong\s*\{[^}]*white-space:\s*nowrap;)(?=[\s\S]*?\.saved-commute-impact-summary-action\s*\{[^}]*grid-row:\s*1;)(?=[\s\S]*?\.saved-commute-impact-summary-chips\s*\{[^}]*grid-column:\s*1 \/ -1;)/s,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*23\.5rem\)\s*\{(?=[\s\S]*?\.saved-commute-impact-summary-heading strong\s*\{[^}]*font-size:\s*0\.76rem;)(?=[\s\S]*?\.saved-commute-impact-summary-action\s*\{[^}]*font-size:\s*0\.52rem;)/s,
    );
    assert.match(globalCss, /\.dark \.saved-commute-impact-summary-chip\.kind-delay\s*\{(?=[^}]*#FEEC41)(?=[^}]*rgba\(254, 236, 65, 0\.14\))[^}]*\}/s);
    assert.match(savedCommuteCardSource, /selectedLeg\.impact\.matchedImpacts\.length === 0 \? \(/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-content-wrapper/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-content/);
    assert.match(globalCss, /\.saved-commute-impact-content-wrapper\s*\{(?=[^}]*display:\s*grid;)(?=[^}]*grid-template-rows:\s*0fr;)(?=[^}]*transition:\s*grid-template-rows)[^}]*\}/s);
    assert.match(globalCss, /\.saved-commute-impact-disclosure\[open\] \.saved-commute-impact-content-wrapper\s*\{[^}]*grid-template-rows:\s*1fr;/s);
    assert.match(globalCss, /\.saved-commute-impact-content\s*\{(?=[^}]*opacity:\s*0;)(?=[^}]*transform:\s*translateY\(-6px\);)(?=[^}]*transition:)[^}]*\}/s);
    assert.match(globalCss, /\.saved-commute-impact-summary-chevron\s*\{(?=[^}]*transition:\s*transform)[^}]*\}/s);
  });

  it("renders a prominent saved-commute map preview banner", () => {
    assert.match(globalCss, /\.commute-path-preview-chip\s*\{[^}]*min-width:\s*min\(560px, calc\(100vw - 2rem\)\);/s);
    assert.match(globalCss, /\.commute-path-preview-chip\s*\{[^}]*bottom:\s*calc\(1\.5rem \+ 64px \+ 28px\);/s);
    assert.match(globalCss, /\.commute-path-preview-chip span\s*\{[^}]*font-size:\s*0\.9rem;/s);
    assert.match(globalCss, /@media \(max-width: 767px\)[\s\S]*?\.commute-path-preview-chip\s*\{[^}]*left:\s*1rem;[^}]*right:\s*1rem;/s);
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-inspector-impact \.commute-path-preview-chip\s*\{[^}]*bottom:\s*calc\(var\(--mobile-inspector-total-height\) \+ 10px\);[^}]*top:\s*auto;/s,
    );
  });

  it("renders saved commute extra-time estimates without claiming precision for major disruptions", () => {
    assert.match(savedCommuteCardSource, /travelTimeEstimate/);
    assert.match(savedCommuteCardSource, /formatEstimateDuration/);
    assert.match(savedCommuteCardSource, /function TravelTimeEstimateBlock/);
    assert.match(savedCommuteCardSource, /saved-commute-time-estimate/);
    assert.match(savedCommuteCardSource, /Travel Time/);
    assert.match(savedCommuteCardSource, /With Impacts/);
    assert.match(savedCommuteCardSource, /Extra Time/);
    assert.match(savedCommuteCardSource, /Confidence/);
    assert.match(savedCommuteCardSource, /Major Disruption on Route — Travel Time Not Reliable/);
    assert.match(savedCommuteCardSource, /function travelTimeSeverity/);
    assert.match(savedCommuteCardSource, /data-travel-time-severity/);
    assert.match(globalCss, /\.saved-commute-time-estimate/);
    assert.match(globalCss, /\.saved-commute-time-estimate\.unreliable/);
    assert.match(globalCss, /\.saved-commute-time-estimate\.unreliable p\s*\{(?=[^}]*justify-items:\s*center)(?=[^}]*padding:\s*0\.75rem 0\.5rem 0)(?=[^}]*text-align:\s*center)[^}]*\}/s);
    assert.match(globalCss, /\.saved-commute-time-estimate\.unreliable \.saved-commute-time-verdict\s*\{[^}]*text-align:\s*center;[^}]*width:\s*100%;/s);
    assert.match(globalCss, /\.saved-commute-time-estimate\.unreliable p > strong,[\s\S]*?\.saved-commute-time-estimate\.unreliable p > span\s*\{(?=[^}]*font-size:\s*1rem !important)(?=[^}]*font-weight:\s*850)(?=[^}]*text-transform:\s*none !important)[^}]*\}/s);
    assert.match(savedCommuteCardSource, /saved-commute-time-status-value/);
    assert.match(globalCss, /\.dark \.saved-commute-time-estimate \.saved-commute-time-status-value,[\s\S]*?color:\s*#fff;/s);
    assert.match(globalCss, /\.saved-commute-time-estimate \.saved-commute-time-status-value\s*\{[^}]*text-transform:\s*none;/s);
    assert.match(globalCss, /\.severity-good \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-decent \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-moderate \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-poor \.saved-commute-time-verdict/);
    assert.match(globalCss, /\.severity-severe \.saved-commute-time-verdict/);
    assert.match(savedCommuteCardSource, /saved-commute-time-headline-clock severity-\$\{selectedTravelTimeSeverity\}/);
    assert.match(savedCommuteCardSource, /hasCurrentImpacts \|\| ignoredImpactsCount > 0 \? \([\s\S]*?<ExclaimAlertIcon[\s\S]*?: \([\s\S]*?<Check/s);
    assert.match(globalCss, /\.saved-commute-time-headline-clock\.severity-good/);
    assert.match(globalCss, /\.saved-commute-time-headline-clock\.severity-severe/);
    assert.match(savedCommuteCardSource, /saved-commute-impact-icon/);
    assert.match(globalCss, /\.saved-commute-impact-icon\s*\{[^}]*align-items:\s*center;[^}]*height:\s*0\.875rem;/s);
    assert.match(globalCss, /\.saved-commute-impact-list\s*\{[^}]*gap:\s*0\.75rem;/s);
  });

  it("renders saved-commute granular notification controls inside the commute feature", () => {
    const eventTypesIndex = savedCommuteEditorSource.indexOf('className="saved-commute-notification-block saved-commute-event-types"');
    const masterToggleIndex = savedCommuteEditorSource.indexOf('className="saved-commute-notification-master-row"');
    const schedulingHelpIndex = savedCommuteEditorSource.indexOf('className="saved-commute-notification-help"');

    assert.match(savedCommutesSource, /updateSavedCommuteNotificationRule/);
    assert.match(savedCommuteEditorSource, /Route Notifications/);
    assert.match(savedCommuteEditorSource, /How Scheduling Works/);
    assert.match(savedCommuteEditorSource, /outboundSchedule/);
    assert.match(savedCommuteEditorSource, /returnSchedule/);
    assert.match(savedCommuteEditorSource, /AM Rush/);
    assert.match(savedCommuteEditorSource, /PM Rush/);
    assert.match(savedCommuteEditorSource, /Every Day/);
    assert.match(savedCommuteEditorSource, /ArrowUpRight/);
    assert.match(savedCommuteEditorSource, /ArrowDownLeft/);
    assert.match(savedCommuteEditorSource, /Sunrise/);
    assert.match(savedCommuteEditorSource, /Sunset/);
    assert.match(savedCommuteEditorSource, /SlidersHorizontal/);
    assert.match(savedCommuteEditorSource, /NotificationEventIcon/);
    assert.match(savedCommuteEditorSource, /notificationEventOptionsForNetwork/);
    assert.match(savedCommuteEditorSource, /scopeNotificationRuleToNetwork/);
    assert.match(savedCommuteEditorSource, /expandedSchedules/);
    assert.match(savedCommuteEditorSource, /Toronto time/);
    assert.doesNotMatch(savedCommuteEditorSource, /Route Section|Whole Route|Selected Section/);
    assert.match(editModelSource, /Mon/);
    assert.match(editModelSource, /Tue/);
    assert.match(editModelSource, /Reduced Speed Zones/);
    assert.match(savedCommuteEditorSource, /saved-commute-notification-rule/);
    assert.match(savedCommuteEditorSource, /rule/);
    assert.match(globalCss, /\.saved-commute-notification-rule/);
    assert.match(globalCss, /\.saved-commute-day-button/);
    assert.match(globalCss, /\.saved-commute-notification-help-chevron/);
    assert.match(savedCommuteEditorSource, /station-arrival-line-divider saved-commute-notification-divider/);
    assert.match(globalCss, /\.saved-commute-event-types\s*\{[^}]*border:\s*0;/s);
    assert.ok(eventTypesIndex < masterToggleIndex);
    assert.ok(masterToggleIndex < schedulingHelpIndex);
    assert.match(globalCss, /\.saved-commute-notification-master-row\s*\{[^}]*padding:\s*0\.25rem 0;/s);
    assert.match(globalCss, /@container \(min-width:\s*34rem\)[\s\S]*label\[data-event-type="reducedSpeedZones"\]\s*\{[^}]*order:\s*3;[\s\S]*label\[data-event-type="plannedClosures"\]\s*\{[^}]*order:\s*4;[\s\S]*label\[data-event-type="serviceRestored"\]\s*\{[^}]*order:\s*5;/s);
    assert.doesNotMatch(globalCss, /\.saved-commute-section-(grid|select)/);
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
    assert.match(savedCommutePickerSource, /site-dropdown-trigger commute-station-trigger/);
    assert.match(savedCommutePickerSource, /site-dropdown-menu commute-station-popover/);
    assert.match(savedCommutesSource, /<ToolbarSelectMenu/);
    assert.match(globalCss, /\.site-dropdown-option\.selected/);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-search-row\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*7px;[^}]*margin:\s*4px 8px 0;/s);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-search-row input\[type="search"\]\s*\{[^}]*appearance:\s*none;[^}]*background:\s*transparent !important;[^}]*box-shadow:\s*none;/s);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-option\s*\{[^}]*margin-inline:\s*8px;[^}]*width:\s*calc\(100% - 16px\);/s);
    assert.match(globalCss, /\.commute-station-stations-scroll-content \.commute-station-option\s*\{[^}]*margin-left:\s*2px;[^}]*margin-right:\s*14px;/s);
    assert.match(globalCss, /\.dark \.site-dropdown-option\s*\{[\s\S]*background:\s*transparent/);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-lines-list\s*\{[\s\S]*gap:\s*0/);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-options\s*\{[\s\S]*gap:\s*6px/);
    assert.match(globalCss, /\.commute-station-popover \.commute-station-option\s*\{[\s\S]*border-radius:\s*7px/);
    assert.doesNotMatch(globalCss, /\.commute-station-popover\s*\{[^}]*background:\s*var\(--panel\)\s*!important/s);
    assert.match(globalCss, /\.commute-station-search-row input\[type="search"\]::\-webkit-search-cancel-button\s*\{[\s\S]*display:\s*none/);
    assert.match(globalCss, /\.commute-station-stations-column > \.commute-station-mobile-back\s*\{[\s\S]*margin-left:\s*0\.5rem;[\s\S]*width:\s*calc\(100% - 1rem\)/);
    assert.match(globalCss, /\.commute-station-stations-scroll-content\s*\{[\s\S]*padding-left:\s*0\.5rem;[\s\S]*padding-right:\s*0\.5rem/);
  });

  it("validates create-account input before sending registration requests", () => {
    assert.match(accountDialogSource, /validateAccountCredentials/);
    assert.match(accountDialogSource, /validateAccountEmail/);
    assert.match(accountDialogSource, /normalizeAccountEmail/);
    assert.match(accountDialogSource, /account-error-live/);
    assert.match(accountDialogSource, /autoComplete="current-password"/);
    assert.match(accountDialogSource, /It was intentionally not accepted before mailbox ownership was proven/);
    assert.match(accountDialogSource, /registerAccount\(\{\s*email:\s*normalizedEmail,\s*displayName:/s);
    assert.match(accountDialogSource, /aria-invalid=\{Boolean\(error && mode === "register"\)\}/);
    assert.match(accountDialogSource, /Use at least 8 characters with a letter and a number, symbol, or space\./);
    assert.match(accountDialogSource, /(?:error|err) instanceof AccountRequestError/);
  });

  it("uses standard HTML form element with submit button for enter-key submission support", () => {
    assert.match(accountDialogSource, /<form/);
    assert.match(accountDialogSource, /onSubmit=\{/);
    assert.match(accountDialogSource, /event\.preventDefault\(\)/);
    assert.match(accountDialogSource, /handleSubmitAccount\(\)/);
    assert.match(accountDialogSource, /<button type="submit" className="account-primary-button"/);
  });

  it("renders forgot-password and reset-password states inside the sign-in dialog", () => {
    assert.match(accountDialogSource, /"forgot-password"/);
    assert.match(accountDialogSource, /"reset-password"/);
    assert.match(accountDialogSource, /Forgot Password\?/);
    assert.match(accountDialogSource, /Send Reset Link/);
    assert.match(accountDialogSource, /Open Local Reset Form/);
    assert.match(accountDialogSource, /Local dev mode: no email was sent/);
    assert.match(accountDialogSource, /Reset Password/);
    assert.match(accountDialogSource, /Back To Sign In/);
    assert.match(accountDialogSource, /requestPasswordReset/);
    assert.match(accountDialogSource, /confirmPasswordReset/);
    assert.match(accountDialogSource, /resetToken/);
    assert.match(accountDialogSource, /passwordConfirmation/);
    assert.match(globalCss, /\.account-link-button/);
    assert.match(globalCss, /\.account-reset-status/);
    assert.match(globalCss, /\.account-reset-dev-note/);
    assert.match(globalCss, /\.account-reset-hint/);
  });

  it("supports emailed reset links through a reset-password route", () => {
    assert.match(dashboardDataSource, /loadDashboardInitialData/);
    assert.match(homePageSource, /fallbackDashboardData/);
    assert.match(resetPasswordPageSource, /searchParams/);
    assert.match(resetPasswordPageSource, /initialPasswordResetToken/);
    assert.match(resetPasswordPageSource, /decodeResetTokenParam/);
    assert.match(shellSource, /initialPasswordResetToken/);
    assert.match(shellSource, /initialPasswordResetToken[\s\S]*"reset-password"/s);
    assert.match(accountDialogSource, /request\?\.mode === "reset-password" \? request\?\.initialToken/);
  });

  it("requires email verification after password registration and supports one-time emailed links", () => {
    assert.match(accountDialogSource, /"verify-email"/);
    assert.match(accountDialogSource, /requestEmailVerification/);
    assert.match(accountDialogSource, /confirmEmailVerification/);
    assert.match(accountDialogSource, /Send New Verification Link/);
    assert.match(accountDialogSource, /Verify Local Account/);
    assert.match(shellSource, /initialEmailVerificationToken/);
    assert.match(verifyEmailPageSource, /initialEmailVerificationToken/);
    assert.match(verifyEmailPageSource, /decodeEmailVerificationTokenParam/);
    assert.match(verifyEmailPageSource, /robots:\s*{\s*index:\s*false,\s*follow:\s*false/s);
  });

  it("formats Sheppard-Yonge and Bloor-Yonge correctly with hyphen awareness", () => {
    assert.match(savedCommutesSource, /toTitleCase/);
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

  it("styles account dialog with opaque slate background, no border, and strong backdrop blur", () => {
    const dialogDarkBlock = globalCss.match(/\.dark \.account-dialog[^{]*\{([^}]+)\}/)?.[1] ?? "";
    assert.match(dialogDarkBlock, /background-color:\s*#0e1016;/);
    assert.match(dialogDarkBlock, /border:\s*none;/);
    assert.doesNotMatch(dialogDarkBlock, /backdrop-filter/);
    assert.match(dialogDarkBlock, /inset/);
    assert.match(dialogDarkBlock, /linear-gradient/);
    assert.match(globalCss, /\.account-dialog-backdrop\s*\{[^}]*backdrop-filter:\s*blur\(50px\)/);
    assert.match(globalCss, /\.account-dialog-header\s*\{[^}]*border-bottom:\s*none;/);
    assert.match(globalCss, /\.account-dialog-close\s*\{[\s\S]*?border:\s*none;/);
    assert.match(globalCss, /\.dark \.account-dialog-close[\s\S]*?border:\s*none;/);
  });

  it("shades dialog footer with noticeable contrast and renders customized switch prompts", () => {
    assert.match(accountDialogSource, /Don&apos;t have an account\?/);
    assert.match(accountDialogSource, /Sign Up/);
    assert.match(accountDialogSource, /Already Have an Account\?/);
    assert.match(accountDialogSource, /account-dialog-footer/);
    assert.match(accountDialogSource, /account-switch-button/);
    assert.match(accountDialogSource, /account-switch-text/);
    assert.match(accountDialogSource, /account-switch-link/);
    assert.match(globalCss, /\.account-dialog-footer\s*\{[\s\S]*border-top:\s*none;/);
    assert.match(globalCss, /\.dark \.account-dialog-footer\s*\{[\s\S]*background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);/);
    assert.match(globalCss, /\.dark \.account-switch-text[\s\S]*color:\s*#ffffff;/);
    assert.match(globalCss, /\.dark \.account-switch-link[\s\S]*color:\s*rgb\(96,\s*165,\s*250\);/);
  });

  it("keeps mobile nav bar and status peek intact and illuminates search account icon directly", () => {
    assert.doesNotMatch(shellSource, /showMobileStatusPeek = [^;]*!accountDialogMode/);
    assert.doesNotMatch(shellSource, /<MobileBottomNav[\s\S]*!accountDialogMode/);
    assert.match(globalCss, /\.dark \.mobile-app-search > \.mobile-app-account[\s\S]*background:\s*transparent;/);
    assert.match(globalCss, /\.dark \.mobile-app-search > \.mobile-app-account svg[\s\S]*filter:\s*drop-shadow\(0 0 3px rgba\(255,\s*255,\s*255,\s*0\.4\)\);/);
    assert.match(globalCss, /\.linewatch-shell:has\(\.account-dialog-backdrop\)[\s\S]*?\.mobile-app-info[\s\S]*?\.mobile-map-network-switch[\s\S]*?filter:\s*blur\(8px\);/);
  });
});
