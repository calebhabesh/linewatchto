/**
 * Pure navigation state transitions and deep-link resolution for LineWatchTO.
 *
 * Owns deterministic transitions across map, station, impact, commute preview,
 * search drill-down, cross-network selections, browser popstate, and desktop Escape.
 */

import { popViewHistory, pushViewHistory, resolveInAppBackAction, type InAppBackAction } from "./view-navigation.ts";
import type { ImpactSelection, ImpactKind } from "./linewatch-data.ts";
import type { NetworkId } from "./regional-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import { accountOAuthErrorState, type AccountOAuthErrorState } from "./account-oauth-error.ts";
import {
  GOOGLE_LINK_SUCCESS_PARAM,
  GOOGLE_LINK_SUCCESS_VALUE,
} from "../components/account-dialog-state.ts";

export type ActiveView =
  | "map"
  | "menu"
  | "search"
  | "status"
  | "line-impacts"
  | "alerts"
  | "delays"
  | "reduced-speed-zones"
  | "closures"
  | "commutes"
  | "notifications"
  | "analytics"
  | "more"
  | "my-stations"
  | "accessibility-outages"
  | "surface-notices"
  | "announcements"
  | "alert-history"
  | "feedback"
  | "privacy-acknowledgements"
  | "release-notes"
  | "source-status";

export type ImpactCategoryView =
  | "alerts"
  | "delays"
  | "reduced-speed-zones"
  | "closures"
  | "line-impacts";

export interface SearchReturnContext {
  activeView: ActiveView;
  selectedStationId: string | null;
  selectedNetwork: NetworkId;
  commutesActiveTab?: "create" | "saved";
  focusedElement?: HTMLElement | null;
}

export interface NavigationState {
  activeView: ActiveView;
  viewHistory: readonly ActiveView[];
  navDirection: "root" | "forward" | "back";
  selectedStationId: string | null;
  stationDrilldownOrigin: string | null;
  selection: ImpactSelection;
  selectionBackBehavior: "clear" | "restore-view";
  commutePathPreview: AccountCommutePathPreview | null;
  commutesFocusedCommuteId: string | null;
  searchReturnContext: SearchReturnContext | null;
  crossNetworkStationSelection: { networkId: NetworkId; stationId: string } | null;
  mobileImpactReturnView: "my-stations" | null;
  impactHistory: readonly ImpactNavigationContext[];
}

export interface ImpactNavigationContext {
  origin: Pick<NavigationState, "activeView" | "viewHistory" | "selection" | "selectionBackBehavior" | "mobileImpactReturnView">;
  destinationView: ActiveView;
  destinationSelection: NonNullable<ImpactSelection>;
  inspectorDetent?: "map-focus" | "details-focus";
  scrollTop?: number;
}

const sameImpact = (a: ImpactSelection, b: ImpactSelection) => a?.kind === b?.kind && a?.id === b?.id;

export function impactReturnContext(state: Pick<NavigationState, "activeView" | "selection" | "impactHistory">): ImpactNavigationContext | null {
  const context = state.impactHistory.at(-1);
  return context && context.destinationView === state.activeView && sameImpact(context.destinationSelection, state.selection)
    ? context : null;
}

function withImpactHistory(state: NavigationState, nextState: NavigationState): NavigationState {
  if (!nextState.selection || state.selectedStationId || state.stationDrilldownOrigin || state.commutePathPreview) return nextState;
  if (state.activeView === nextState.activeView && sameImpact(state.selection, nextState.selection)) return nextState;
  return {
    ...nextState,
    impactHistory: [...(impactReturnContext(state) ? state.impactHistory : []), {
      origin: {
        activeView: state.activeView, viewHistory: state.viewHistory, selection: state.selection,
        selectionBackBehavior: state.selectionBackBehavior, mobileImpactReturnView: state.mobileImpactReturnView,
      },
      destinationView: nextState.activeView,
      destinationSelection: nextState.selection,
    }],
  };
}

export function transitionImpactBack(state: NavigationState): NavigationState | null {
  const context = impactReturnContext(state);
  if (!context) return null;
  return { ...state, ...context.origin, impactHistory: state.impactHistory.slice(0, -1), navDirection: "back" };
}

export const INITIAL_NAVIGATION_STATE: NavigationState = {
  activeView: "map",
  viewHistory: [],
  navDirection: "root",
  selectedStationId: null,
  stationDrilldownOrigin: null,
  selection: null,
  selectionBackBehavior: "clear",
  commutePathPreview: null,
  commutesFocusedCommuteId: null,
  searchReturnContext: null,
  crossNetworkStationSelection: null,
  mobileImpactReturnView: null,
  impactHistory: [],
};

export type BrowserHistoryEffect =
  | { type: "push" }
  | { type: "consume"; count?: number }
  | { type: "none" };

export interface NavigationTransitionResult {
  nextState: NavigationState;
  historyEffect: BrowserHistoryEffect;
}

export const SEARCH_RETURN_LABELS: Record<string, string> = {
  status: "Status",
  map: "Status",
  more: "More",
  "my-stations": "My Stations",
  commutes: "My Commutes",
  "source-status": "Source Status",
  alerts: "Active Alerts",
  delays: "Delays",
  closures: "Planned Closures",
  "reduced-speed-zones": "Reduced Speed Zones",
  "alert-history": "Alert History",
  "line-impacts": "Line Impacts",
  "accessibility-outages": "Accessibility",
  "surface-notices": "Service Notices",
  announcements: "Announcements",
  analytics: "Analytics",
  notifications: "Notifications",
  "release-notes": "Release Notes",
  "privacy-acknowledgements": "Privacy",
  feedback: "Feedback",
};

export function searchReturnDestinationAndLabel(
  context: SearchReturnContext | null,
): { destination: string; label: string } {
  if (!context) {
    return { destination: "status", label: "Back to Status" };
  }
  const destination = context.selectedStationId ? "my-stations" : context.activeView;
  const label = context.selectedStationId
    ? "Back to station details"
    : `Back to ${SEARCH_RETURN_LABELS[context.activeView] ?? "previous page"}`;
  return { destination, label };
}

export function isStatusSubView(view: ActiveView): boolean {
  return (
    view === "alerts" ||
    view === "delays" ||
    view === "reduced-speed-zones" ||
    view === "closures" ||
    view === "line-impacts" ||
    view === "accessibility-outages" ||
    view === "surface-notices" ||
    view === "announcements" ||
    view === "source-status" ||
    view === "analytics" ||
    view === "feedback"
  );
}

export function viewForImpactKind(kind: ImpactKind): ActiveView {
  switch (kind) {
    case "suspension":
      return "alerts";
    case "delay":
      return "delays";
    case "reduced-speed-zone":
      return "reduced-speed-zones";
    case "planned-closure":
      return "closures";
  }
}

export function defaultSubmenuBackFallback(view: ActiveView, isMobile: boolean): ActiveView {
  const isStatus = isStatusSubView(view);
  if (isMobile) {
    if (isStatus) return "status";
    if (view === "commutes") return "map";
    return "more";
  }
  return isStatus ? "status" : "more";
}

export function resolveLineDeepLink(
  rawLine: string | null,
): { lineId: string; network: NetworkId } | null {
  if (!rawLine) return null;
  const normalized = rawLine.trim().toLowerCase();

  // TTC line matching
  if (normalized === "line-1" || normalized === "1" || normalized === "1-yonge-university" || normalized === "yonge-university") {
    return { lineId: "line-1", network: "ttc" };
  }
  if (normalized === "line-2" || normalized === "2" || normalized === "2-bloor-danforth" || normalized === "bloor-danforth") {
    return { lineId: "line-2", network: "ttc" };
  }
  if (normalized === "line-4" || normalized === "4" || normalized === "4-sheppard" || normalized === "sheppard") {
    return { lineId: "line-4", network: "ttc" };
  }
  if (normalized === "line-5" || normalized === "5" || normalized === "5-eglinton" || normalized === "eglinton") {
    return { lineId: "line-5", network: "ttc" };
  }
  if (normalized === "line-6" || normalized === "6" || normalized === "6-finch-west" || normalized === "finch-west") {
    return { lineId: "line-6", network: "ttc" };
  }

  // Regional line matching
  const regionalMap: Record<string, string> = {
    "regional-lw": "regional-lw",
    "lw": "regional-lw",
    "lakeshore-west": "regional-lw",
    "regional-le": "regional-le",
    "le": "regional-le",
    "lakeshore-east": "regional-le",
    "regional-ki": "regional-ki",
    "ki": "regional-ki",
    "kitchener": "regional-ki",
    "regional-mi": "regional-mi",
    "mi": "regional-mi",
    "milton": "regional-mi",
    "regional-st": "regional-st",
    "st": "regional-st",
    "stouffville": "regional-st",
    "regional-rh": "regional-rh",
    "rh": "regional-rh",
    "richmond-hill": "regional-rh",
    "regional-br": "regional-br",
    "br": "regional-br",
    "barrie": "regional-br",
    "regional-up": "regional-up",
    "up": "regional-up",
    "up-express": "regional-up",
  };

  if (regionalMap[normalized]) {
    return { lineId: regionalMap[normalized], network: "regional" };
  }

  return null;
}

export interface NavigationDeepLinkResult {
  requestedNetwork: NetworkId | null;
  accountError: AccountOAuthErrorState | null;
  accountLinked: boolean;
  impactSelection: ImpactSelection;
  stationDeepLink: { stationId: string; network: NetworkId } | null;
  lineDeepLink: { lineId: string; network: NetworkId } | null;
  panelView: ActiveView | null;
  surfaceNoticeInitialContent?: "notices" | "trip-changes";
  cleanedParams: URLSearchParams;
  shouldReplaceUrl: boolean;
}

export function parseNavigationDeepLinks(
  params: URLSearchParams,
  options: { hasReleaseNotes?: boolean } = {},
): NavigationDeepLinkResult {
  const nextParams = new URLSearchParams(params);
  let shouldReplaceUrl = false;

  const rawNetwork = params.get("network");
  const requestedNetwork: NetworkId | null =
    rawNetwork === "ttc" || rawNetwork === "regional" ? rawNetwork : null;

  let accountLinked = false;
  let accountError: AccountOAuthErrorState | null = null;
  const accountLinkedValue = params.get(GOOGLE_LINK_SUCCESS_PARAM);
  if (accountLinkedValue === GOOGLE_LINK_SUCCESS_VALUE) {
    accountLinked = true;
    nextParams.delete("account_error");
    nextParams.delete(GOOGLE_LINK_SUCCESS_PARAM);
    shouldReplaceUrl = true;
  } else {
    const accountErrorCode = params.get("account_error");
    if (accountErrorCode !== null) {
      accountError = accountOAuthErrorState(accountErrorCode);
      nextParams.delete("account_error");
      shouldReplaceUrl = true;
    }
  }

  const panel = params.get("panel");
  const panelToView: Record<string, ActiveView> = {
    status: "status",
    alerts: "alerts",
    delays: "delays",
    "reduced-speed-zones": "reduced-speed-zones",
    closures: "closures",
    commutes: "commutes",
    notifications: "notifications",
    analytics: "analytics",
    "trip-changes": "surface-notices",
  };
  if (options.hasReleaseNotes) {
    panelToView["release-notes"] = "release-notes";
  }

  let surfaceNoticeInitialContent: "notices" | "trip-changes" | undefined;
  if (panel === "trip-changes") {
    surfaceNoticeInitialContent = "trip-changes";
  }

  const impactKind = params.get("impactKind") as ImpactKind | null;
  const impactId = params.get("impactId");
  const impactSelection: ImpactSelection =
    impactKind && impactId ? { kind: impactKind, id: impactId } : null;

  const requestedStationId = params.get("station");
  const validStationDeepLink =
    requestedNetwork !== null &&
    requestedStationId !== null &&
    /^[a-z0-9_-]{1,80}$/.test(requestedStationId);

  const stationDeepLink = validStationDeepLink
    ? { stationId: requestedStationId, network: requestedNetwork }
    : null;

  const requestedLineParam = params.get("line") || params.get("lineId");
  const resolvedLineDeepLink = resolveLineDeepLink(requestedLineParam);

  let lineDeepLink: { lineId: string; network: NetworkId } | null = null;
  let panelView: ActiveView | null = null;

  if (impactSelection) {
    if (panel) {
      nextParams.delete("panel");
      shouldReplaceUrl = true;
    }
  } else if (stationDeepLink) {
    // station deep link consumed
  } else if (resolvedLineDeepLink) {
    lineDeepLink = resolvedLineDeepLink;
    nextParams.delete("line");
    nextParams.delete("lineId");
    if (panel) nextParams.delete("panel");
    shouldReplaceUrl = true;
  } else if (panel && panelToView[panel]) {
    panelView = panelToView[panel];
    nextParams.delete("panel");
    shouldReplaceUrl = true;
  }

  return {
    requestedNetwork,
    accountError,
    accountLinked,
    impactSelection,
    stationDeepLink,
    lineDeepLink,
    panelView,
    surfaceNoticeInitialContent,
    cleanedParams: nextParams,
    shouldReplaceUrl,
  };
}

export function replaceBrowserSearchParams(params: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

/**
 * Pure transition: Navigate to a root destination (e.g. status, map, search, more).
 */
export function transitionNavigateRoot(
  state: NavigationState,
  nextView: ActiveView,
  options: { currentDepth?: number } = {},
): NavigationTransitionResult {
  const currentDepth = options.currentDepth ?? 0;
  if (state.activeView === nextView) {
    return { nextState: state, historyEffect: { type: "none" } };
  }

  let historyEffect: BrowserHistoryEffect = { type: "none" };
  if (nextView === "map") {
    historyEffect = { type: "consume", count: currentDepth };
  } else if (state.activeView === "map") {
    historyEffect = { type: "push" };
  } else if (currentDepth > 1) {
    historyEffect = { type: "consume", count: currentDepth - 1 };
  }

  return {
    nextState: {
      ...state,
      activeView: nextView,
      viewHistory: [],
      stationDrilldownOrigin: null,
      searchReturnContext: nextView === "search" ? state.searchReturnContext : null,
      navDirection: "root",
      impactHistory: [],
    },
    historyEffect,
  };
}

/**
 * Pure transition: Navigate forward to a deeper panel view.
 */
export function transitionNavigateForward(
  state: NavigationState,
  nextView: ActiveView,
): NavigationTransitionResult {
  if (state.activeView === nextView) {
    return { nextState: state, historyEffect: { type: "none" } };
  }

  return {
    nextState: withImpactHistory(state, {
      ...state,
      activeView: nextView,
      viewHistory: pushViewHistory(state.viewHistory, state.activeView, nextView),
      searchReturnContext: nextView === "search" ? state.searchReturnContext : null,
      navDirection: "forward",
    }),
    historyEffect: { type: "push" },
  };
}

/**
 * Pure transition: Close an active panel, clearing selections and returning to map.
 */
export function transitionClosePanel(
  state: NavigationState,
  options: { currentDepth?: number } = {},
): NavigationTransitionResult {
  const currentDepth = options.currentDepth ?? 0;
  return {
    nextState: {
      ...state,
      activeView: "map",
      viewHistory: [],
      selectedStationId: null,
      stationDrilldownOrigin: null,
      commutePathPreview: null,
      selection: null,
      searchReturnContext: null,
      mobileImpactReturnView: null,
      impactHistory: [],
      navDirection: "back",
    },
    historyEffect: { type: "consume", count: currentDepth },
  };
}

/**
 * Pure transition: Submenu back navigation.
 * Handles station origin restoration, commute preview return, and history popping.
 */
export function transitionSubmenuBack(
  state: NavigationState,
  options: { isMobile: boolean },
): NavigationTransitionResult {
  const impactBack = transitionImpactBack(state);
  if (impactBack && !state.stationDrilldownOrigin && !state.commutePathPreview) {
    return { nextState: impactBack, historyEffect: { type: "consume", count: 1 } };
  }
  const stationOriginId = state.stationDrilldownOrigin;
  if (stationOriginId) {
    return {
      nextState: {
        ...state,
        activeView: "map",
        viewHistory: [],
        selectedStationId: stationOriginId,
        stationDrilldownOrigin: null,
        selection: null,
        selectionBackBehavior: "clear",
        impactHistory: [],
        navDirection: "back",
      },
      historyEffect: { type: "consume", count: 1 },
    };
  }

  const fallback = state.commutePathPreview
    ? ("commutes" as ActiveView)
    : defaultSubmenuBackFallback(state.activeView, options.isMobile);

  const previous = popViewHistory(state.viewHistory, fallback);
  const targetView: ActiveView = state.commutePathPreview ? "commutes" : previous.view;
  const returningToCommutesFromPreview = Boolean(state.commutePathPreview) && targetView === "commutes";
  const returningToSelectedMap = targetView === "map" && Boolean(state.selection) && !stationOriginId;

  const nextCommutesFocusedId = returningToCommutesFromPreview
    ? state.commutePathPreview?.commuteId ?? state.commutePathPreview?.id ?? null
    : state.commutesFocusedCommuteId;

  const nextHistory = previous.history.length > 0
    ? previous.history
    : returningToCommutesFromPreview
      ? (options.isMobile ? (["more"] as ActiveView[]) : (["status"] as ActiveView[]))
      : [];

  return {
    nextState: {
      ...state,
      activeView: targetView,
      viewHistory: nextHistory,
      commutePathPreview: returningToCommutesFromPreview ? null : state.commutePathPreview,
      commutesFocusedCommuteId: nextCommutesFocusedId,
      selection: returningToSelectedMap ? state.selection : null,
      selectionBackBehavior: returningToSelectedMap ? state.selectionBackBehavior : "clear",
      navDirection: "back",
    },
    historyEffect: { type: "consume", count: 1 },
  };
}

/**
 * Pure transition: Select a station or clear station selection.
 */
export function transitionSelectStation(
  state: NavigationState,
  stationId: string | null,
): NavigationTransitionResult {
  const currentId = state.selectedStationId;
  let historyEffect: BrowserHistoryEffect = { type: "none" };

  if (stationId && !currentId) {
    historyEffect = { type: "push" };
  } else if (!stationId && currentId) {
    historyEffect = { type: "consume", count: 1 };
  }

  return {
    nextState: {
      ...state,
      selectedStationId: stationId,
      stationDrilldownOrigin: null,
      selection: null,
      commutePathPreview: null,
      navDirection: stationId ? "forward" : "back",
    },
    historyEffect,
  };
}

/**
 * Pure transition: Close a specific selected station (verifying expected id).
 */
export function transitionCloseStation(
  state: NavigationState,
  expectedStationId: string,
): NavigationTransitionResult {
  if (state.selectedStationId !== expectedStationId) {
    return { nextState: state, historyEffect: { type: "none" } };
  }

  return {
    nextState: {
      ...state,
      selectedStationId: null,
      stationDrilldownOrigin: null,
      navDirection: "back",
    },
    historyEffect: { type: "consume", count: 1 },
  };
}

/**
 * Pure transition: Select a map impact (e.g. alert, delay, RSZ, closure).
 */
export function transitionSelectImpact(
  state: NavigationState,
  options: {
    selection: ImpactSelection;
    targetView: ActiveView;
    isMobile: boolean;
  },
): NavigationTransitionResult {
  const { selection, targetView, isMobile } = options;

  if (!selection) {
    return {
      nextState: {
        ...state,
        selection: null,
        selectionBackBehavior: "clear",
        impactHistory: [],
      },
      historyEffect: state.selection ? { type: "consume", count: 1 } : { type: "none" },
    };
  }

  const changesImpact = !sameImpact(state.selection, selection);
  const changesView = state.activeView !== (isMobile ? "map" : targetView);
  const historyEffect: BrowserHistoryEffect = changesImpact || changesView ? { type: "push" } : { type: "none" };
  const currentView = state.activeView;

  if (isMobile) {
    const preservesOrigin =
      currentView === "map" &&
      state.selectionBackBehavior === "restore-view" &&
      state.mobileImpactReturnView !== null;

    const selectionBackBehavior =
      currentView === "map" && !preservesOrigin ? "clear" : "restore-view";

    const viewHistory =
      currentView === "map"
        ? state.viewHistory
        : pushViewHistory(state.viewHistory, currentView, "map" as ActiveView);

    return {
      nextState: withImpactHistory(state, {
        ...state,
        selectedStationId: null,
        commutePathPreview: state.commutePathPreview ? null : state.commutePathPreview,
        selection,
        selectionBackBehavior,
        activeView: "map",
        viewHistory,
        mobileImpactReturnView: preservesOrigin ? state.mobileImpactReturnView : null,
        navDirection: "forward",
      }),
      historyEffect,
    };
  }

  const selectionBackBehavior = currentView === targetView ? "clear" : "restore-view";
  const viewHistory =
    currentView === targetView
      ? state.viewHistory
      : pushViewHistory(state.viewHistory, currentView, targetView);

  return {
    nextState: withImpactHistory(state, {
      ...state,
      selectedStationId: null,
      commutePathPreview: state.commutePathPreview ? null : state.commutePathPreview,
      selection,
      selectionBackBehavior,
      activeView: targetView,
      viewHistory,
      navDirection: "forward",
    }),
    historyEffect,
  };
}

/** Open an impact's list detail without implicitly opening its map. */
export function transitionSelectImpactDetails(
  state: NavigationState,
  selection: NonNullable<ImpactSelection>,
  targetView: ActiveView,
): NavigationTransitionResult {
  const nextState = withImpactHistory(state, {
    ...state,
    activeView: targetView,
    viewHistory: pushViewHistory(state.viewHistory, state.activeView, targetView),
    selectedStationId: null,
    commutePathPreview: null,
    selection,
    selectionBackBehavior: "restore-view",
    navDirection: "forward",
  });
  const changesLocation = state.activeView !== targetView || !sameImpact(state.selection, selection);
  return { nextState, historyEffect: changesLocation ? { type: "push" } : { type: "none" } };
}

/**
 * Pure transition: Select an impact from within station details.
 * Captures current station as stationDrilldownOrigin so back returns to station.
 */
export function transitionSelectStationImpact(
  state: NavigationState,
  options: {
    selection: ImpactSelection;
    targetView: ActiveView;
    isMobile: boolean;
  },
): NavigationTransitionResult {
  const originStation = state.selectedStationId;
  const result = transitionSelectImpact(state, options);
  if (originStation) {
    return {
      ...result,
      nextState: {
        ...result.nextState,
        stationDrilldownOrigin: originStation,
      },
    };
  }
  return result;
}

/**
 * Pure transition: Preview a saved commute path on the map.
 */
export function transitionPreviewCommute(
  state: NavigationState,
  path: AccountCommutePathPreview,
): NavigationTransitionResult {
  return {
    nextState: {
      ...state,
      commutePathPreview: path,
      activeView: "map",
      viewHistory: pushViewHistory(state.viewHistory, state.activeView, "map" as ActiveView),
      navDirection: "forward",
    },
    historyEffect: { type: "push" },
  };
}

/**
 * Pure transition: Clear commute path preview.
 */
export function transitionClearCommutePreview(
  state: NavigationState,
): NavigationTransitionResult {
  return {
    nextState: {
      ...state,
      commutePathPreview: null,
    },
    historyEffect: { type: "none" },
  };
}

/**
 * Pure transition: Start search with return context.
 */
export function transitionStartSearch(
  state: NavigationState,
  context: SearchReturnContext,
): NavigationTransitionResult {
  return {
    nextState: {
      ...state,
      searchReturnContext: context,
      activeView: "search",
      navDirection: "forward",
    },
    historyEffect: { type: "none" },
  };
}

/**
 * Pure transition: Close search and restore destination view and station.
 */
export function transitionCloseSearch(
  state: NavigationState,
  options: {
    destination: ActiveView;
    stationToRestore: string | null;
    currentDepth?: number;
  },
): NavigationTransitionResult {
  const { destination, stationToRestore, currentDepth = 0 } = options;
  const rootTransition = transitionNavigateRoot(state, destination, { currentDepth });
  return {
    ...rootTransition,
    nextState: {
      ...rootTransition.nextState,
      selectedStationId: stationToRestore,
      searchReturnContext: null,
    },
  };
}

/**
 * Pure transition: Cross-network station selection.
 */
export function transitionCrossNetworkStation(
  state: NavigationState,
  options: { networkId: NetworkId; stationId: string },
): NavigationTransitionResult {
  const currentView = state.activeView;
  const viewHistory =
    currentView === "map"
      ? state.viewHistory
      : pushViewHistory(state.viewHistory, currentView, "map" as ActiveView);

  return {
    nextState: {
      ...state,
      activeView: "map",
      viewHistory,
      crossNetworkStationSelection: options,
      navDirection: "forward",
    },
    historyEffect: { type: "push" },
  };
}

/**
 * Pure transition: Network change application, fulfilling pending cross-network station selection.
 */
export function transitionApplyNetworkChange(
  state: NavigationState,
  networkId: NetworkId,
): NavigationTransitionResult {
  const pendingStationSelection =
    state.crossNetworkStationSelection?.networkId === networkId
      ? state.crossNetworkStationSelection
      : null;

  return {
    nextState: {
      ...state,
      selectedStationId: pendingStationSelection ? pendingStationSelection.stationId : null,
      crossNetworkStationSelection: null,
      selection: null,
      impactHistory: [],
      commutePathPreview: null,
      stationDrilldownOrigin: null,
    },
    historyEffect: { type: "none" },
  };
}

/**
 * Pure transition: Browser Back (popstate) event.
 */
export function transitionBrowserBack(
  state: NavigationState,
  options: {
    isMobile: boolean;
    accountDialogOpen?: boolean;
  },
): {
  nextState: NavigationState;
  actionTaken: InAppBackAction;
} {
  const impactBack = transitionImpactBack(state);
  if (impactBack && !options.accountDialogOpen && !state.selectedStationId && !state.commutePathPreview && !state.stationDrilldownOrigin) {
    return { nextState: impactBack, actionTaken: state.activeView === "map" ? "clear-impact" : "navigate-view" };
  }
  const action = resolveInAppBackAction({
    accountDialogOpen: Boolean(options.accountDialogOpen),
    stationOpen: Boolean(state.selectedStationId),
    commutePreviewOpen: Boolean(state.commutePathPreview),
    viewOpen: state.activeView !== "map",
    impactOpen: Boolean(state.selection),
  });

  switch (action) {
    case "close-account-dialog":
      return { nextState: state, actionTaken: action };

    case "close-station": {
      return {
        nextState: {
          ...state,
          selectedStationId: null,
          stationDrilldownOrigin: null,
          navDirection: "back",
        },
        actionTaken: action,
      };
    }

    case "close-commute-preview": {
      const focusedId = state.commutePathPreview?.commuteId ?? state.commutePathPreview?.id ?? null;
      return {
        nextState: {
          ...state,
          commutePathPreview: null,
          commutesFocusedCommuteId: focusedId,
          selection: null,
          activeView: "commutes",
          navDirection: "back",
        },
        actionTaken: action,
      };
    }

    case "navigate-view": {
      if (state.stationDrilldownOrigin) {
        const originStationId = state.stationDrilldownOrigin;
        return {
          nextState: {
            ...state,
            stationDrilldownOrigin: null,
            viewHistory: [],
            activeView: "map",
            selection: null,
            selectionBackBehavior: "clear",
            selectedStationId: originStationId,
            navDirection: "back",
          },
          actionTaken: action,
        };
      }
      if (state.selection && state.selectionBackBehavior === "clear" && !state.commutePathPreview) {
        return {
          nextState: {
            ...state,
            selection: null,
            navDirection: "back",
          },
          actionTaken: action,
        };
      }
      if (state.commutePathPreview) {
        const focusedId = state.commutePathPreview.commuteId ?? state.commutePathPreview.id;
        return {
          nextState: {
            ...state,
            commutePathPreview: null,
            commutesFocusedCommuteId: focusedId,
            activeView: "commutes",
            selection: null,
            selectionBackBehavior: "clear",
            navDirection: "back",
          },
          actionTaken: action,
        };
      }

      const fallback = defaultSubmenuBackFallback(state.activeView, options.isMobile);
      const previous = popViewHistory(state.viewHistory, fallback);
      return {
        nextState: {
          ...state,
          viewHistory: previous.history,
          activeView: previous.view,
          selection: previous.view === "map" ? state.selection : null,
          selectionBackBehavior: previous.view === "map" ? state.selectionBackBehavior : "clear",
          navDirection: "back",
        },
        actionTaken: action,
      };
    }

    case "clear-impact": {
      const shouldRestore = state.selectionBackBehavior === "restore-view";
      const fallback = defaultSubmenuBackFallback(state.activeView, options.isMobile);
      const previous = shouldRestore ? popViewHistory(state.viewHistory, fallback) : null;
      const restoredStationId = state.stationDrilldownOrigin ?? state.selectedStationId;
      return {
        nextState: {
          ...state,
          selection: null,
          selectionBackBehavior: "clear",
          activeView: previous ? previous.view : state.activeView,
          viewHistory: previous ? previous.history : state.viewHistory,
          selectedStationId: restoredStationId,
          stationDrilldownOrigin: null,
          navDirection: "back",
        },
        actionTaken: action,
      };
    }

    case "none":
      return { nextState: state, actionTaken: "none" };
  }
}

/**
 * Pure transition: Desktop Escape key press.
 */
export function transitionDesktopEscape(
  state: NavigationState,
  options: {
    isSearchActive: boolean;
    isMobile: boolean;
  },
): {
  nextState: NavigationState;
  consumed: boolean;
} {
  if (options.isMobile) {
    return { nextState: state, consumed: false };
  }

  // 1. If search is active -> close search (handled via caller)
  if (options.isSearchActive || state.activeView === "search") {
    return { nextState: state, consumed: true };
  }

  // 2. If station selected -> close station
  if (state.selectedStationId) {
    const result = transitionCloseStation(state, state.selectedStationId);
    return { nextState: result.nextState, consumed: true };
  }

  // 3. If map selection active -> clear selection
  if (state.selection) {
    return {
      nextState: {
        ...state,
        selection: null,
        selectionBackBehavior: "clear",
      },
      consumed: true,
    };
  }

  // 4. If in a subpanel view -> submenu back
  const subviews: readonly ActiveView[] = [
    "alerts",
    "delays",
    "reduced-speed-zones",
    "closures",
    "line-impacts",
    "accessibility-outages",
    "surface-notices",
    "announcements",
    "analytics",
    "alert-history",
    "notifications",
    "feedback",
    "privacy-acknowledgements",
    "release-notes",
  ];

  if (subviews.includes(state.activeView)) {
    const result = transitionSubmenuBack(state, { isMobile: false });
    return { nextState: result.nextState, consumed: true };
  }

  return { nextState: state, consumed: false };
}

export const VIEW_SCROLL_SELECTORS: Partial<Record<ActiveView, string>> = {
  menu: "#linewatch-main-menu-scroll",
  status: ".mobile-status-content-scroll",
  more: ".mobile-more-content-scroll",
};
