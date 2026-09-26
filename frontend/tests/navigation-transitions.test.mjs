import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INITIAL_NAVIGATION_STATE,
  transitionNavigateForward,
  transitionClosePanel,
  transitionSubmenuBack,
  transitionSelectStation,
  transitionCloseStation,
  transitionSelectStationImpact,
  transitionPreviewCommute,
  transitionStartSearch,
  transitionCloseSearch,
  transitionCrossNetworkStation,
  transitionApplyNetworkChange,
  transitionBrowserBack,
  transitionDesktopEscape,
  resolveLineDeepLink,
  parseNavigationDeepLinks,
  searchReturnDestinationAndLabel,
  isStatusSubView,
  defaultSubmenuBackFallback,
} from "../src/app/navigation-transitions.ts";

describe("Navigation Transition Table — Required Rows", () => {
  // Row 1: map → station → impact → back
  it("Row 1: preserves station drilldown origin when selecting an impact from station, and restores station on back", () => {
    // 1. Initial on map
    let state = INITIAL_NAVIGATION_STATE;
    assert.equal(state.activeView, "map");
    assert.equal(state.selectedStationId, null);

    // 2. Select station "st-clair"
    const stationSelect = transitionSelectStation(state, "st-clair");
    state = stationSelect.nextState;
    assert.equal(stationSelect.historyEffect.type, "push");
    assert.equal(state.selectedStationId, "st-clair");
    assert.equal(state.stationDrilldownOrigin, null);

    // 3. Select impact from station (e.g. delay) on desktop
    const impactSelectDesktop = transitionSelectStationImpact(state, {
      selection: { kind: "delay", id: "delay-st-clair" },
      targetView: "delays",
      isMobile: false,
    });
    assert.equal(impactSelectDesktop.nextState.stationDrilldownOrigin, "st-clair");
    assert.equal(impactSelectDesktop.nextState.selectedStationId, null);
    assert.deepEqual(impactSelectDesktop.nextState.selection, { kind: "delay", id: "delay-st-clair" });
    assert.equal(impactSelectDesktop.nextState.activeView, "delays");

    // 4. Submenu back from the impact view restores the originating station
    const backResult = transitionSubmenuBack(impactSelectDesktop.nextState, { isMobile: false });
    assert.equal(backResult.historyEffect.type, "consume");
    assert.equal(backResult.nextState.activeView, "map");
    assert.equal(backResult.nextState.selectedStationId, "st-clair");
    assert.equal(backResult.nextState.stationDrilldownOrigin, null);
    assert.equal(backResult.nextState.selection, null);

    // 5. Back again closes the station
    const closeStationResult = transitionCloseStation(backResult.nextState, "st-clair");
    assert.equal(closeStationResult.historyEffect.type, "consume");
    assert.equal(closeStationResult.nextState.selectedStationId, null);
  });

  // Row 1 (Mobile): map → station → impact → back
  it("Row 1 (Mobile): keeps mobile view on map drilldown and restores station on browser back", () => {
    let state = transitionSelectStation(INITIAL_NAVIGATION_STATE, "queen").nextState;
    assert.equal(state.selectedStationId, "queen");

    const impactSelectMobile = transitionSelectStationImpact(state, {
      selection: { kind: "planned-closure", id: "closure-1" },
      targetView: "closures",
      isMobile: true,
    });
    state = impactSelectMobile.nextState;
    assert.equal(state.activeView, "map");
    assert.equal(state.stationDrilldownOrigin, "queen");
    assert.equal(state.selectedStationId, null);

    const back = transitionBrowserBack(state, { isMobile: true });
    assert.equal(back.actionTaken, "clear-impact");
    assert.equal(back.nextState.activeView, "map");
    assert.equal(back.nextState.selectedStationId, "queen");
    assert.equal(back.nextState.stationDrilldownOrigin, null);
    assert.equal(back.nextState.selection, null);
  });

  // Row 2: search → station → back
  it("Row 2: records search return context, navigates to station, and supports clean return", () => {
    // 1. User is on "status" view
    let state = transitionNavigateForward(INITIAL_NAVIGATION_STATE, "status").nextState;
    assert.equal(state.activeView, "status");

    // 2. Open search with return context
    const searchCtx = {
      activeView: "status",
      selectedStationId: null,
      selectedNetwork: "ttc",
    };
    state = transitionStartSearch(state, searchCtx).nextState;
    assert.equal(state.activeView, "search");
    assert.deepEqual(state.searchReturnContext, searchCtx);

    const { destination, label } = searchReturnDestinationAndLabel(state.searchReturnContext);
    assert.equal(destination, "status");
    assert.equal(label, "Back to Status");

    // 3. User selects station and closes search
    const closeSearch = transitionCloseSearch(state, {
      destination: "status",
      stationToRestore: "dundas",
      currentDepth: 2,
    });
    state = closeSearch.nextState;
    assert.equal(state.activeView, "status");
    assert.equal(state.selectedStationId, "dundas");
    assert.equal(state.searchReturnContext, null);

    // 4. Closing the station leaves the user on status view
    const closeStation = transitionCloseStation(state, "dundas");
    state = closeStation.nextState;
    assert.equal(state.activeView, "status");
    assert.equal(state.selectedStationId, null);
  });

  // Row 3: commute → preview → back
  it("Row 3: previews commute on map, and back restores commutes view with focused commute ID", () => {
    // 1. User opens commutes
    let state = transitionNavigateForward(INITIAL_NAVIGATION_STATE, "commutes").nextState;
    assert.equal(state.activeView, "commutes");

    // 2. User previews commute
    const mockPreview = {
      id: "commute-123",
      commuteId: "commute-123",
      name: "Work Commute",
      networkId: "ttc",
      originStationId: "finch",
      destinationStationId: "union",
      legs: [],
    };
    const previewResult = transitionPreviewCommute(state, mockPreview);
    state = previewResult.nextState;
    assert.equal(previewResult.historyEffect.type, "push");
    assert.equal(state.activeView, "map");
    assert.deepEqual(state.commutePathPreview, mockPreview);

    // 3. Submenu back restores commutes and focuses the previewed commute
    const back = transitionSubmenuBack(state, { isMobile: false });
    assert.equal(back.historyEffect.type, "consume");
    assert.equal(back.nextState.activeView, "commutes");
    assert.equal(back.nextState.commutePathPreview, null);
    assert.equal(back.nextState.commutesFocusedCommuteId, "commute-123");
  });

  // Row 4: cross-network station selection
  it("Row 4: handles cross-network station selection and applies network change cleanly", () => {
    let state = INITIAL_NAVIGATION_STATE;
    assert.equal(state.crossNetworkStationSelection, null);

    // 1. Pick a regional station from search while on TTC
    const crossNetResult = transitionCrossNetworkStation(state, {
      networkId: "regional",
      stationId: "oakville",
    });
    state = crossNetResult.nextState;
    assert.equal(crossNetResult.historyEffect.type, "push");
    assert.equal(state.activeView, "map");
    assert.deepEqual(state.crossNetworkStationSelection, {
      networkId: "regional",
      stationId: "oakville",
    });

    // 2. Network transition completes for "regional"
    const applyResult = transitionApplyNetworkChange(state, "regional");
    state = applyResult.nextState;
    assert.equal(state.selectedStationId, "oakville");
    assert.equal(state.crossNetworkStationSelection, null);
    assert.equal(state.selection, null);
    assert.equal(state.commutePathPreview, null);
  });

  // Row 5: close versus submenu back
  it("Row 5: close panel empties history and clears selection, whereas submenu back pops one entry", () => {
    // Drill into menu -> status -> delays
    let state = transitionNavigateForward(INITIAL_NAVIGATION_STATE, "status").nextState;
    state = transitionNavigateForward(state, "delays").nextState;
    assert.equal(state.activeView, "delays");
    assert.deepEqual(state.viewHistory, ["map", "status"]);

    // Case A: Submenu back goes back to "status"
    const backResult = transitionSubmenuBack(state, { isMobile: false });
    assert.equal(backResult.nextState.activeView, "status");
    assert.deepEqual(backResult.nextState.viewHistory, ["map"]);

    // Case B: Close panel completely resets to map and clears history
    const closeResult = transitionClosePanel(state, { currentDepth: 3 });
    assert.equal(closeResult.historyEffect.type, "consume");
    assert.equal(closeResult.historyEffect.count, 3);
    assert.equal(closeResult.nextState.activeView, "map");
    assert.deepEqual(closeResult.nextState.viewHistory, []);
    assert.equal(closeResult.nextState.selectedStationId, null);
  });

  // Row 6: browser Back and Escape
  it("Row 6: browser Back pops priority surfaces: dialog -> station -> commute preview -> view -> impact", () => {
    // 1. Station open -> popstate closes station
    const stationState = {
      ...INITIAL_NAVIGATION_STATE,
      selectedStationId: "bloor",
    };
    const back1 = transitionBrowserBack(stationState, { isMobile: false });
    assert.equal(back1.actionTaken, "close-station");
    assert.equal(back1.nextState.selectedStationId, null);

    // 2. Commute preview open -> popstate closes preview and restores commutes
    const previewState = {
      ...INITIAL_NAVIGATION_STATE,
      commutePathPreview: { id: "c-1", commuteId: "c-1" },
    };
    const back2 = transitionBrowserBack(previewState, { isMobile: false });
    assert.equal(back2.actionTaken, "close-commute-preview");
    assert.equal(back2.nextState.activeView, "commutes");
    assert.equal(back2.nextState.commutePathPreview, null);

    // 3. Subview open -> popstate navigates view back
    const subviewState = {
      ...INITIAL_NAVIGATION_STATE,
      activeView: "delays",
      viewHistory: ["status"],
    };
    const back3 = transitionBrowserBack(subviewState, { isMobile: false });
    assert.equal(back3.actionTaken, "navigate-view");
    assert.equal(back3.nextState.activeView, "status");

    // 4. Impact open on map -> popstate clears impact
    const impactState = {
      ...INITIAL_NAVIGATION_STATE,
      activeView: "map",
      selection: { kind: "delay", id: "d-1" },
    };
    const back4 = transitionBrowserBack(impactState, { isMobile: false });
    assert.equal(back4.actionTaken, "clear-impact");
    assert.equal(back4.nextState.selection, null);
  });

  it("Row 6: Desktop Escape closes search -> station -> selection -> subview in priority order", () => {
    // Priority 1: Search active
    const searchEsc = transitionDesktopEscape(INITIAL_NAVIGATION_STATE, {
      isSearchActive: true,
      isMobile: false,
    });
    assert.equal(searchEsc.consumed, true);

    // Priority 2: Station open
    const stationEsc = transitionDesktopEscape(
      { ...INITIAL_NAVIGATION_STATE, selectedStationId: "union" },
      { isSearchActive: false, isMobile: false },
    );
    assert.equal(stationEsc.consumed, true);
    assert.equal(stationEsc.nextState.selectedStationId, null);

    // Priority 3: Selection active
    const selectEsc = transitionDesktopEscape(
      { ...INITIAL_NAVIGATION_STATE, selection: { kind: "alert", id: "a-1" } },
      { isSearchActive: false, isMobile: false },
    );
    assert.equal(selectEsc.consumed, true);
    assert.equal(selectEsc.nextState.selection, null);

    // Priority 4: Subview active (e.g. closures) -> back to status
    const subviewEsc = transitionDesktopEscape(
      { ...INITIAL_NAVIGATION_STATE, activeView: "closures", viewHistory: ["status"] },
      { isSearchActive: false, isMobile: false },
    );
    assert.equal(subviewEsc.consumed, true);
    assert.equal(subviewEsc.nextState.activeView, "status");

    // Not consumed if already on root map without selections
    const rootEsc = transitionDesktopEscape(INITIAL_NAVIGATION_STATE, {
      isSearchActive: false,
      isMobile: false,
    });
    assert.equal(rootEsc.consumed, false);
  });

  // Row 7: URL parameters and deep links
  it("Row 7: parses panel, line/lineId, station, impact, and OAuth URL parameters", () => {
    // 1. Line deep link for Line 1
    const p1 = new URLSearchParams("line=1&network=ttc");
    const d1 = parseNavigationDeepLinks(p1);
    assert.equal(d1.requestedNetwork, "ttc");
    assert.deepEqual(d1.lineDeepLink, { lineId: "line-1", network: "ttc" });
    assert.equal(d1.shouldReplaceUrl, true);
    assert.equal(d1.cleanedParams.has("line"), false);

    // 2. Regional line deep link for Lakeshore West
    const p2 = new URLSearchParams("lineId=lakeshore-west");
    const d2 = parseNavigationDeepLinks(p2);
    assert.deepEqual(d2.lineDeepLink, { lineId: "regional-lw", network: "regional" });

    // 3. Station deep link
    const p3 = new URLSearchParams("station=spadina&network=ttc");
    const d3 = parseNavigationDeepLinks(p3);
    assert.deepEqual(d3.stationDeepLink, { stationId: "spadina", network: "ttc" });

    // 4. Concrete impact deep link
    const p4 = new URLSearchParams("impactKind=delay&impactId=delay-sheppard&panel=delays");
    const d4 = parseNavigationDeepLinks(p4);
    assert.deepEqual(d4.impactSelection, { kind: "delay", id: "delay-sheppard" });
    assert.equal(d4.shouldReplaceUrl, true);
    assert.equal(d4.cleanedParams.has("panel"), false);

    // 5. Panel deep link
    const p5 = new URLSearchParams("panel=commutes");
    const d5 = parseNavigationDeepLinks(p5);
    assert.equal(d5.panelView, "commutes");
    assert.equal(d5.shouldReplaceUrl, true);

    // 6. OAuth error parameter
    const p6 = new URLSearchParams("account_error=google_oauth_failed");
    const d6 = parseNavigationDeepLinks(p6);
    assert.equal(d6.accountError?.message, "Could not complete Google sign-in. Try again.");
    assert.equal(d6.shouldReplaceUrl, true);
    assert.equal(d6.cleanedParams.has("account_error"), false);

    // 7. Google link success parameter
    const p7 = new URLSearchParams("account_linked=google");
    const d7 = parseNavigationDeepLinks(p7);
    assert.equal(d7.accountLinked, true);
    assert.equal(d7.shouldReplaceUrl, true);
    assert.equal(d7.cleanedParams.has("account_linked"), false);
  });

  it("resolves all standard line deep link aliases for TTC and Regional networks", () => {
    assert.deepEqual(resolveLineDeepLink("1"), { lineId: "line-1", network: "ttc" });
    assert.deepEqual(resolveLineDeepLink("2"), { lineId: "line-2", network: "ttc" });
    assert.deepEqual(resolveLineDeepLink("4"), { lineId: "line-4", network: "ttc" });
    assert.deepEqual(resolveLineDeepLink("5"), { lineId: "line-5", network: "ttc" });
    assert.deepEqual(resolveLineDeepLink("6"), { lineId: "line-6", network: "ttc" });
    assert.deepEqual(resolveLineDeepLink("kitchener"), { lineId: "regional-ki", network: "regional" });
    assert.deepEqual(resolveLineDeepLink("barrie"), { lineId: "regional-br", network: "regional" });
    assert.deepEqual(resolveLineDeepLink("up-express"), { lineId: "regional-up", network: "regional" });
    assert.equal(resolveLineDeepLink("invalid-line"), null);
    assert.equal(resolveLineDeepLink(null), null);
  });

  it("classifies status subviews and provides mobile-aware back fallbacks", () => {
    assert.equal(isStatusSubView("alerts"), true);
    assert.equal(isStatusSubView("delays"), true);
    assert.equal(isStatusSubView("closures"), true);
    assert.equal(isStatusSubView("reduced-speed-zones"), true);
    assert.equal(isStatusSubView("accessibility-outages"), true);
    assert.equal(isStatusSubView("more"), false);
    assert.equal(isStatusSubView("commutes"), false);

    assert.equal(defaultSubmenuBackFallback("alerts", true), "status");
    assert.equal(defaultSubmenuBackFallback("commutes", true), "map");
    assert.equal(defaultSubmenuBackFallback("notifications", true), "more");
    assert.equal(defaultSubmenuBackFallback("alerts", false), "status");
    assert.equal(defaultSubmenuBackFallback("notifications", false), "more");
  });
});
