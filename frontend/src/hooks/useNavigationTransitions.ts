"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  type ActiveView,
  type ImpactCategoryView,
  type SearchReturnContext,
  type NavigationState,
  INITIAL_NAVIGATION_STATE,
  transitionNavigateRoot,
  transitionNavigateForward,
  transitionSubmenuBack,
  transitionSelectImpact,
  transitionSelectImpactDetails,
  impactReturnContext,
  type ImpactNavigationContext,
  transitionBrowserBack,
  isStatusSubView,
  searchReturnDestinationAndLabel,
  VIEW_SCROLL_SELECTORS,
} from "../app/navigation-transitions";
import { popViewHistory, pushViewHistory } from "../app/view-navigation";
import type { ImpactSelection } from "../app/linewatch-data";
import type { NetworkId } from "../app/regional-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { currentBrowserLocalPath } from "../components/account-dialog-state";

const BROWSER_NAVIGATION_STATE_KEY = "linewatchNavigation";

interface BrowserNavigationState {
  sessionId: string;
  depth: number;
}

export interface AccessibilityOutageTarget {
  assetType: "elevator" | "escalator";
  stationId: string;
}

export interface UseNavigationTransitionsOptions {
  isMobile: boolean;
  reducedMotion: boolean;
  selectedNetwork: NetworkId;
  accountDialogOpen: boolean;
  onCloseAccountDialog: () => void;
  onNetworkChange: (networkId: NetworkId) => void;
  onClearPersistedCommuteDraft: () => void;
  onResetMapPresentation?: () => void;
  onSetMobileInspectorDetent?: (detent: "map-focus" | "details-focus") => void;
  getMobileInspectorDetent?: () => "map-focus" | "details-focus";
  onRecordPwaEngagement?: () => void;
  onDesktopSidebarEnsureOpen?: () => void;
  onAnnounceDesktop?: (message: string) => void;
  onDesktopEscapeSearch?: () => void;
  isSearchFocused?: () => boolean;
  viewForImpactSelection: (selection: NonNullable<ImpactSelection>) => ActiveView;
}

export function useNavigationTransitions(options: UseNavigationTransitionsOptions) {
  const {
    isMobile,
    reducedMotion,
    selectedNetwork,
    accountDialogOpen,
    onCloseAccountDialog,
    onNetworkChange,
    onClearPersistedCommuteDraft,
    onResetMapPresentation,
    onSetMobileInspectorDetent,
    getMobileInspectorDetent,
    onRecordPwaEngagement,
    onDesktopSidebarEnsureOpen,
    onAnnounceDesktop: announceDesktop,
    onDesktopEscapeSearch,
    isSearchFocused,
    viewForImpactSelection,
  } = options;

  // Primary navigation state
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [viewHistory, setViewHistory] = useState<readonly ActiveView[]>(INITIAL_NAVIGATION_STATE.viewHistory);
  const [navDirection, setNavDirection] = useState<"root" | "forward" | "back">("root");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImpactSelection>(null);
  const [selectionBackBehavior, setSelectionBackBehavior] = useState<"clear" | "restore-view">("clear");
  const [commutePathPreview, setCommutePathPreview] = useState<AccountCommutePathPreview | null>(null);
  const [commutesFocusedCommuteId, setCommutesFocusedCommuteId] = useState<string | null>(null);
  const [searchReturnContext, setSearchReturnContext] = useState<SearchReturnContext | null>(null);
  const [stationPanelActivationKey, setStationPanelActivationKey] = useState(0);
  const [selectionAttentionGeneration, setSelectionAttentionGeneration] = useState(0);
  const [mobileImpactReturnView, setMobileImpactReturnView] = useState<"my-stations" | null>(null);
  const [impactHistory, setImpactHistory] = useState<readonly ImpactNavigationContext[]>([]);
  const impactHistoryRef = useRef<readonly ImpactNavigationContext[]>([]);
  const getInspectorDetentRef = useRef(getMobileInspectorDetent);
  useEffect(() => {
    getInspectorDetentRef.current = getMobileInspectorDetent;
  }, [getMobileInspectorDetent]);

  // Feature launches & targets
  const [impactListLaunch, setImpactListLaunch] = useState({ lineId: null as string | null, requestId: 0 });
  const [lineImpactLaunch, setLineImpactLaunch] = useState({ lineId: null as string | null, requestId: 0 });
  const [accessibilityOutageTarget, setAccessibilityOutageTarget] = useState<AccessibilityOutageTarget | null>(null);
  const [surfaceNoticeInitialQuery, setSurfaceNoticeInitialQuery] = useState("");
  const [surfaceNoticeInitialId, setSurfaceNoticeInitialId] = useState<string | null>(null);
  const [surfaceNoticeInitialContent, setSurfaceNoticeInitialContent] = useState<"notices" | "trip-changes">("notices");

  // Animation & transition states
  const [isClosingPanel, setIsClosingPanel] = useState(false);
  const closingTimeoutRef = useRef<number | null>(null);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const backTimeoutRef = useRef<number | null>(null);
  const [isClosingSearch, setIsClosingSearch] = useState(false);
  const searchClosingTimeoutRef = useRef<number | null>(null);

  // Fast-path synchronization refs
  const activeViewRef = useRef<ActiveView>(activeView);
  const viewHistoryRef = useRef<readonly ActiveView[]>(viewHistory);
  const selectedStationIdRef = useRef<string | null>(selectedStationId);
  const stationDrilldownOriginRef = useRef<string | null>(null);
  const selectionRef = useRef<ImpactSelection>(selection);
  const selectionBackBehaviorRef = useRef<"clear" | "restore-view">(selectionBackBehavior);
  const commutePathPreviewRef = useRef<AccountCommutePathPreview | null>(commutePathPreview);
  const searchReturnContextRef = useRef<SearchReturnContext | null>(searchReturnContext);
  const crossNetworkStationSelectionRef = useRef<{ networkId: NetworkId; stationId: string } | null>(null);
  const viewScrollPositionsRef = useRef<Partial<Record<ActiveView, number>>>({});

  // Browser navigation history session
  const browserNavigationSessionRef = useRef("");
  const browserNavigationDepthRef = useRef(0);
  const suppressedPopstateCountRef = useRef(0);

  // Keep refs synchronized
  useEffect(() => {
    activeViewRef.current = activeView;
    viewHistoryRef.current = viewHistory;
    selectedStationIdRef.current = selectedStationId;
    selectionRef.current = selection;
    selectionBackBehaviorRef.current = selectionBackBehavior;
    commutePathPreviewRef.current = commutePathPreview;
    searchReturnContextRef.current = searchReturnContext;
  }, [activeView, commutePathPreview, searchReturnContext, selectedStationId, selection, selectionBackBehavior, viewHistory]);

  // Clean up pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (closingTimeoutRef.current) window.clearTimeout(closingTimeoutRef.current);
      if (backTimeoutRef.current) window.clearTimeout(backTimeoutRef.current);
      if (searchClosingTimeoutRef.current) window.clearTimeout(searchClosingTimeoutRef.current);
    };
  }, []);

  // Restore scroll positions on view transition
  useEffect(() => {
    const selector = VIEW_SCROLL_SELECTORS[activeView];
    const savedScrollTop = viewScrollPositionsRef.current[activeView];
    if (!selector || savedScrollTop === undefined) return;

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const scrollElement = document.querySelector<HTMLElement>(selector);
        if (scrollElement) scrollElement.scrollTop = savedScrollTop;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeView]);

  // Clean up transient launch targets when leaving their view
  useEffect(() => {
    if (activeView !== "accessibility-outages" && accessibilityOutageTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccessibilityOutageTarget(null);
    }
  }, [accessibilityOutageTarget, activeView]);

  useEffect(() => {
    if (activeView !== "surface-notices" && (surfaceNoticeInitialQuery || surfaceNoticeInitialId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSurfaceNoticeInitialQuery("");
      setSurfaceNoticeInitialId(null);
    }
  }, [activeView, surfaceNoticeInitialId, surfaceNoticeInitialQuery]);

  // Browser navigation push
  const pushBrowserNavigationEntry = useCallback(() => {
    if (typeof window === "undefined" || !browserNavigationSessionRef.current) return;
    browserNavigationDepthRef.current += 1;
    window.history.pushState({
      ...window.history.state,
      [BROWSER_NAVIGATION_STATE_KEY]: {
        sessionId: browserNavigationSessionRef.current,
        depth: browserNavigationDepthRef.current,
      } satisfies BrowserNavigationState,
    }, "", currentBrowserLocalPath());
  }, []);

  // Browser navigation consume
  const consumeBrowserNavigationEntries = useCallback((requestedCount = 1) => {
    if (typeof window === "undefined" || !browserNavigationSessionRef.current) return;
    const count = Math.min(requestedCount, browserNavigationDepthRef.current);
    if (count <= 0) return;
    browserNavigationDepthRef.current -= count;
    suppressedPopstateCountRef.current += 1;
    window.history.go(-count);
  }, []);

  const getCurrentNavigationState = useCallback((): NavigationState => ({
    activeView: activeViewRef.current,
    viewHistory: viewHistoryRef.current,
    navDirection,
    selectedStationId: selectedStationIdRef.current,
    stationDrilldownOrigin: stationDrilldownOriginRef.current,
    selection: selectionRef.current,
    selectionBackBehavior: selectionBackBehaviorRef.current,
    commutePathPreview: commutePathPreviewRef.current,
    commutesFocusedCommuteId,
    searchReturnContext: searchReturnContextRef.current,
    crossNetworkStationSelection: crossNetworkStationSelectionRef.current,
    mobileImpactReturnView,
    impactHistory: impactHistoryRef.current,
  }), [commutesFocusedCommuteId, mobileImpactReturnView, navDirection]);

  const syncImpactHistory = useCallback((nextState: NavigationState) => {
    const nextHistory = nextState.impactHistory;
    const addedContext = nextHistory.at(-1);
    const selector = addedContext ? VIEW_SCROLL_SELECTORS[addedContext.origin.activeView] : null;
    const scrollTop = selector ? document.querySelector<HTMLElement>(selector)?.scrollTop : undefined;
    const history = addedContext && nextState.navDirection === "forward" && addedContext !== impactHistoryRef.current.at(-1)
      ? [...nextHistory.slice(0, -1), { ...addedContext, inspectorDetent: getInspectorDetentRef.current?.(), scrollTop }]
      : nextHistory;
    impactHistoryRef.current = history;
    setImpactHistory(history);
  }, []);

  const saveCurrentViewScroll = useCallback(() => {
    const selector = VIEW_SCROLL_SELECTORS[activeViewRef.current];
    const element = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (element) viewScrollPositionsRef.current[activeViewRef.current] = element.scrollTop;
  }, []);

  const applyImpactBack = useCallback((nextState: NavigationState) => {
    const context = impactHistoryRef.current.at(-1);
    syncImpactHistory(nextState);
    activeViewRef.current = nextState.activeView;
    viewHistoryRef.current = nextState.viewHistory;
    selectionRef.current = nextState.selection;
    selectionBackBehaviorRef.current = nextState.selectionBackBehavior;
    setActiveView(nextState.activeView);
    setViewHistory(nextState.viewHistory);
    setSelection(nextState.selection);
    setSelectionBackBehavior(nextState.selectionBackBehavior);
    setMobileImpactReturnView(nextState.mobileImpactReturnView);
    setNavDirection("back");
    if (context?.scrollTop !== undefined) {
      viewScrollPositionsRef.current[nextState.activeView] = context.scrollTop;
      const selector = VIEW_SCROLL_SELECTORS[nextState.activeView];
      if (selector) window.requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) element.scrollTop = context.scrollTop!;
      });
    }
    if (nextState.activeView === "map" && nextState.selection) {
      onSetMobileInspectorDetent?.(context?.inspectorDetent ?? "details-focus");
    }
  }, [onSetMobileInspectorDetent, syncImpactHistory]);

  const dismissImpactNavigation = useCallback(() => {
    const state = getCurrentNavigationState();
    if (!impactReturnContext(state) || state.stationDrilldownOrigin || state.commutePathPreview) return false;
    const origin = state.impactHistory[0].origin;
    consumeBrowserNavigationEntries(state.impactHistory.length);
    applyImpactBack({ ...state, ...origin, selection: null, selectionBackBehavior: "clear", impactHistory: [], navDirection: "back" });
    return true;
  }, [applyImpactBack, consumeBrowserNavigationEntries, getCurrentNavigationState]);

  // Navigate Root
  const navigateRoot = useCallback((nextView: ActiveView) => {
    impactHistoryRef.current = [];
    setImpactHistory([]);
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    if (activeViewRef.current === nextView) return;

    const result = transitionNavigateRoot(getCurrentNavigationState(), nextView, {
      currentDepth: browserNavigationDepthRef.current,
    });

    if (result.historyEffect.type === "consume") {
      consumeBrowserNavigationEntries(result.historyEffect.count);
    } else if (result.historyEffect.type === "push") {
      pushBrowserNavigationEntry();
    }

    viewHistoryRef.current = result.nextState.viewHistory;
    stationDrilldownOriginRef.current = null;
    searchReturnContextRef.current = result.nextState.searchReturnContext;
    setSearchReturnContext(result.nextState.searchReturnContext);
    activeViewRef.current = result.nextState.activeView;
    setNavDirection(result.nextState.navDirection);
    setViewHistory(result.nextState.viewHistory);
    setActiveView(result.nextState.activeView);
  }, [consumeBrowserNavigationEntries, getCurrentNavigationState, pushBrowserNavigationEntry]);

  // Navigate Forward
  const navigateForward = useCallback((nextView: ActiveView) => {
    const currentView = activeViewRef.current;
    if (currentView === nextView) return;

    const scrollSelector = VIEW_SCROLL_SELECTORS[currentView];
    const scrollElement = scrollSelector ? document.querySelector<HTMLElement>(scrollSelector) : null;
    if (scrollElement) {
      viewScrollPositionsRef.current[currentView] = scrollElement.scrollTop;
    }

    const result = transitionNavigateForward(getCurrentNavigationState(), nextView);
    syncImpactHistory(result.nextState);
    pushBrowserNavigationEntry();

    viewHistoryRef.current = result.nextState.viewHistory;
    searchReturnContextRef.current = result.nextState.searchReturnContext;
    setSearchReturnContext(result.nextState.searchReturnContext);
    activeViewRef.current = result.nextState.activeView;
    setNavDirection(result.nextState.navDirection);
    setViewHistory(result.nextState.viewHistory);
    setActiveView(result.nextState.activeView);
  }, [getCurrentNavigationState, pushBrowserNavigationEntry, syncImpactHistory]);

  // Close Panel
  const handleClosePanel = useCallback(() => {
    if (isClosingPanel) return;
    impactHistoryRef.current = [];
    setImpactHistory([]);
    consumeBrowserNavigationEntries(browserNavigationDepthRef.current);
    setIsClosingPanel(true);
    viewHistoryRef.current = [];
    selectedStationIdRef.current = null;
    setSelectedStationId(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    onClearPersistedCommuteDraft();

    if (closingTimeoutRef.current) window.clearTimeout(closingTimeoutRef.current);
    closingTimeoutRef.current = window.setTimeout(() => {
      activeViewRef.current = "map";
      setActiveView("map");
      setViewHistory([]);
      setIsClosingPanel(false);
      selectionRef.current = null;
      setSelection(null);
      onResetMapPresentation?.();
      onSetMobileInspectorDetent?.("map-focus");
      setAccessibilityOutageTarget(null);
    }, reducedMotion ? 0 : isMobile ? 240 : 380);
  }, [consumeBrowserNavigationEntries, isClosingPanel, isMobile, onClearPersistedCommuteDraft, onResetMapPresentation, onSetMobileInspectorDetent, reducedMotion]);

  // Submenu Back
  const handleSubmenuBack = useCallback(() => {
    if (isGoingBack) return;
    consumeBrowserNavigationEntries();
    setNavDirection("back");
    if (backTimeoutRef.current) window.clearTimeout(backTimeoutRef.current);

    const stationOriginId = stationDrilldownOriginRef.current;
    const currentState = getCurrentNavigationState();
    const result = transitionSubmenuBack(currentState, { isMobile });
    if (impactReturnContext(currentState) && !stationOriginId && !currentState.commutePathPreview) {
      applyImpactBack(result.nextState);
      return;
    }

    const finishBackNavigation = () => {
      backTimeoutRef.current = null;
      stationDrilldownOriginRef.current = null;
      viewHistoryRef.current = result.nextState.viewHistory;
      setViewHistory(result.nextState.viewHistory);
      const targetView = result.nextState.activeView;
      activeViewRef.current = targetView;
      setActiveView(targetView);
      setIsGoingBack(false);

      const returningToCommutesFromPreview = Boolean(commutePathPreviewRef.current) && targetView === "commutes";
      if (returningToCommutesFromPreview) {
        if (commutePathPreviewRef.current) {
          setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
        }
        commutePathPreviewRef.current = null;
        setCommutePathPreview(null);
      }

      if (stationOriginId) {
        selectedStationIdRef.current = stationOriginId;
        setSelectedStationId(stationOriginId);
        selectionRef.current = null;
        setSelection(null);
        setSelectionBackBehavior("clear");
        selectionBackBehaviorRef.current = "clear";
      } else {
        selectedStationIdRef.current = result.nextState.selectedStationId;
        setSelectedStationId(result.nextState.selectedStationId);
        selectionRef.current = result.nextState.selection;
        setSelection(result.nextState.selection);
        setSelectionBackBehavior(result.nextState.selectionBackBehavior);
        selectionBackBehaviorRef.current = result.nextState.selectionBackBehavior;
      }

      if (result.nextState.commutesFocusedCommuteId) {
        setCommutesFocusedCommuteId(result.nextState.commutesFocusedCommuteId);
      }
      commutePathPreviewRef.current = result.nextState.commutePathPreview;
      setCommutePathPreview(result.nextState.commutePathPreview);
      setAccessibilityOutageTarget(null);
    };

    if (reducedMotion || !isMobile || (isMobile && result.nextState.activeView !== "map")) {
      finishBackNavigation();
      return;
    }

    setIsGoingBack(true);
    backTimeoutRef.current = window.setTimeout(finishBackNavigation, 240);
  }, [applyImpactBack, consumeBrowserNavigationEntries, getCurrentNavigationState, isGoingBack, isMobile, reducedMotion]);

  const navigateToMapDrilldown = useCallback(() => {
    const currentView = activeViewRef.current;
    if (currentView === "map") {
      setActiveView("map");
      return;
    }
    viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, currentView, "map" as ActiveView);
    setViewHistory(viewHistoryRef.current);
    activeViewRef.current = "map";
    setActiveView("map");
  }, []);

  const restorePreviousView = useCallback(() => {
    const fallback: ActiveView = commutePathPreviewRef.current
      ? "commutes"
      : isMobile
        ? "map"
        : "status";
    const previous = popViewHistory(viewHistoryRef.current, fallback);
    viewHistoryRef.current = previous.history;
    setViewHistory(previous.history);
    activeViewRef.current = previous.view;
    if (commutePathPreviewRef.current && previous.view === "commutes") {
      setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
    }
    setActiveView(previous.view);
    return previous.view;
  }, [isMobile]);

  const restoreMapDrilldownOrigin = useCallback(() => {
    if (activeViewRef.current !== "map") return;
    restorePreviousView();
  }, [restorePreviousView]);

  // Select Station
  const handleSelectStationId = useCallback((id: string | null) => {
    const currentId = selectedStationIdRef.current;
    if (id && !currentId) {
      pushBrowserNavigationEntry();
    } else if (!id && currentId) {
      consumeBrowserNavigationEntries();
    }

    selectedStationIdRef.current = id;
    stationDrilldownOriginRef.current = null;
    if (id) {
      setNavDirection("forward");
      setStationPanelActivationKey((current) => current + 1);
      onDesktopSidebarEnsureOpen?.();
      if (announceDesktop) {
        announceDesktop("Station details opened");
      }
      onRecordPwaEngagement?.();
      if (isMobile) {
        onSetMobileInspectorDetent?.("details-focus");
      }
      navigateToMapDrilldown();
    } else {
      setNavDirection("back");
    }

    setSelectedStationId(id);
    selectionRef.current = null;
    setSelection(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
  }, [announceDesktop, consumeBrowserNavigationEntries, isMobile, navigateToMapDrilldown, onDesktopSidebarEnsureOpen, onRecordPwaEngagement, onSetMobileInspectorDetent, pushBrowserNavigationEntry]);

  // Close Specific Station
  const closeSelectedStation = useCallback((expectedStationId: string) => {
    if (selectedStationIdRef.current !== expectedStationId) return;
    consumeBrowserNavigationEntries();
    setNavDirection("back");
    stationDrilldownOriginRef.current = null;
    selectedStationIdRef.current = null;
    setSelectedStationId((current) => current === expectedStationId ? null : current);
    if (announceDesktop) announceDesktop("Station details closed");
  }, [announceDesktop, consumeBrowserNavigationEntries]);

  // Map Select Impact
  const handleMapSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    selectedStationIdRef.current = null;
    setSelectedStationId(null);
    if (!commutePathPreviewRef.current) {
      setCommutePathPreview(null);
    }

    if (!nextSelection) {
      impactHistoryRef.current = [];
      setImpactHistory([]);
      if (selectionRef.current) consumeBrowserNavigationEntries();
      selectionRef.current = null;
      selectionBackBehaviorRef.current = "clear";
      setSelection(null);
      setSelectionBackBehavior("clear");
      return;
    }

    setSelectionAttentionGeneration((current) => current + 1);
    saveCurrentViewScroll();

    const targetView = viewForImpactSelection(nextSelection);
    const result = transitionSelectImpact(getCurrentNavigationState(), {
      selection: nextSelection,
      targetView,
      isMobile,
    });
    if (result.historyEffect.type === "push") pushBrowserNavigationEntry();
    syncImpactHistory(result.nextState);

    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    selectionBackBehaviorRef.current = result.nextState.selectionBackBehavior;
    setSelectionBackBehavior(result.nextState.selectionBackBehavior);
    viewHistoryRef.current = result.nextState.viewHistory;
    setViewHistory(result.nextState.viewHistory);

    if (isMobile) {
      onRecordPwaEngagement?.();
      onSetMobileInspectorDetent?.("details-focus");
      if (activeViewRef.current !== "map") {
        viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, activeViewRef.current, "map" as ActiveView);
        setViewHistory(viewHistoryRef.current);
        activeViewRef.current = "map";
        setActiveView("map");
      }
      return;
    }

    onDesktopSidebarEnsureOpen?.();
    activeViewRef.current = targetView;
    setActiveView(targetView);
  }, [consumeBrowserNavigationEntries, getCurrentNavigationState, isMobile, onDesktopSidebarEnsureOpen, onRecordPwaEngagement, onSetMobileInspectorDetent, pushBrowserNavigationEntry, saveCurrentViewScroll, syncImpactHistory, viewForImpactSelection]);

  const handleSelectImpactDetails = useCallback((nextSelection: NonNullable<ImpactSelection>) => {
    saveCurrentViewScroll();
    const result = transitionSelectImpactDetails(getCurrentNavigationState(), nextSelection, viewForImpactSelection(nextSelection));
    if (result.historyEffect.type === "push") pushBrowserNavigationEntry();
    syncImpactHistory(result.nextState);
    selectedStationIdRef.current = null;
    setSelectedStationId(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    selectionRef.current = result.nextState.selection;
    setSelection(result.nextState.selection);
    selectionBackBehaviorRef.current = result.nextState.selectionBackBehavior;
    setSelectionBackBehavior(result.nextState.selectionBackBehavior);
    activeViewRef.current = result.nextState.activeView;
    setActiveView(result.nextState.activeView);
    viewHistoryRef.current = result.nextState.viewHistory;
    setViewHistory(result.nextState.viewHistory);
    setNavDirection("forward");
    setSelectionAttentionGeneration((current) => current + 1);
    onDesktopSidebarEnsureOpen?.();
  }, [getCurrentNavigationState, onDesktopSidebarEnsureOpen, pushBrowserNavigationEntry, saveCurrentViewScroll, syncImpactHistory, viewForImpactSelection]);

  // Station Select Impact
  const handleStationSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    if (selectedStationIdRef.current) {
      stationDrilldownOriginRef.current = selectedStationIdRef.current;
    }
    handleMapSelectImpact(nextSelection);
  }, [handleMapSelectImpact]);

  // Preview Commute
  const previewCommute = useCallback((path: AccountCommutePathPreview) => {
    pushBrowserNavigationEntry();
    commutePathPreviewRef.current = path;
    setCommutePathPreview(path);
    viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, activeViewRef.current, "map" as ActiveView);
    setViewHistory(viewHistoryRef.current);
    activeViewRef.current = "map";
    setNavDirection("forward");
    setActiveView("map");
  }, [pushBrowserNavigationEntry]);

  // Clear Commute Preview
  const clearCommutePreview = useCallback((commuteIdOrEvent?: string | unknown) => {
    const commuteId = typeof commuteIdOrEvent === "string" ? commuteIdOrEvent : undefined;
    if (commuteId && (!commutePathPreviewRef.current || (commutePathPreviewRef.current.id !== commuteId && commutePathPreviewRef.current.commuteId !== commuteId))) {
      return;
    }
    if (activeViewRef.current === "commutes") {
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
      selectionRef.current = null;
      setSelection(null);
      selectedStationIdRef.current = null;
      setSelectedStationId(null);
      setAccessibilityOutageTarget(null);
      return;
    }
    if (commutePathPreviewRef.current) {
      setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
    }
    consumeBrowserNavigationEntries();
    setNavDirection("back");
    setIsGoingBack(true);
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
    }
    backTimeoutRef.current = window.setTimeout(() => {
      if (commutePathPreviewRef.current) {
        setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
      }
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
      selectionRef.current = null;
      setSelection(null);
      selectedStationIdRef.current = null;
      setSelectedStationId(null);
      setAccessibilityOutageTarget(null);
      viewHistoryRef.current = isMobile ? ["more"] : ["status"];
      activeViewRef.current = "commutes";
      setActiveView("commutes");
      setIsGoingBack(false);
    }, reducedMotion ? 0 : 380);
  }, [consumeBrowserNavigationEntries, isMobile, reducedMotion]);

  // Open Impact Category
  const openImpactCategory = useCallback((view: ImpactCategoryView, lineId?: string) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    if (closingTimeoutRef.current) {
      window.clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
      backTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    setIsClosingPanel(false);
    setIsGoingBack(false);

    onDesktopSidebarEnsureOpen?.();
    selectedStationIdRef.current = null;
    setSelectedStationId(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    searchReturnContextRef.current = null;
    setSearchReturnContext(null);

    setImpactListLaunch((current) => ({
      lineId: lineId ?? null,
      requestId: current.requestId + 1,
    }));
    selectionRef.current = null;
    setSelection(null);
    setNavDirection("forward");

    if (activeViewRef.current === view) {
      const scrollSelector = VIEW_SCROLL_SELECTORS[view];
      const scrollElement = scrollSelector ? document.querySelector<HTMLElement>(scrollSelector) : null;
      if (scrollElement) scrollElement.scrollTop = 0;
      return;
    }
    navigateForward(view);
  }, [navigateForward, onDesktopSidebarEnsureOpen]);

  // Open Line Impacts
  const openLineImpacts = useCallback((lineId: string) => {
    setLineImpactLaunch((current) => ({ lineId, requestId: current.requestId + 1 }));
    openImpactCategory("line-impacts", lineId);
  }, [openImpactCategory]);

  // Open Accessibility Outage
  const openAccessibilityOutage = useCallback((target: AccessibilityOutageTarget) => {
    selectionRef.current = null;
    setSelection(null);
    selectedStationIdRef.current = null;
    setSelectedStationId(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    setAccessibilityOutageTarget(target);
    navigateForward("accessibility-outages");
  }, [navigateForward]);

  // Search Context Capture
  const captureSearchReturnContext = useCallback((commutesActiveTab?: "create" | "saved") => {
    if (activeViewRef.current === "search") return;
    if (!searchReturnContextRef.current) {
      const context: SearchReturnContext = {
        activeView: activeViewRef.current,
        selectedStationId: selectedStationIdRef.current,
        selectedNetwork,
        commutesActiveTab: activeViewRef.current === "commutes" ? commutesActiveTab : undefined,
        focusedElement: typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null,
      };
      searchReturnContextRef.current = context;
      setSearchReturnContext(context);
    }
  }, [selectedNetwork]);

  // Close Search
  const handleCloseSearch = useCallback((options?: {
    stationToRestore?: string | null;
    searchOrigin?: ActiveView;
    commutesTabRestorer?: (tab: "create" | "saved") => void;
  }) => {
    if (isClosingSearch) return;

    const returnCtx = searchReturnContextRef.current;
    searchReturnContextRef.current = null;
    setSearchReturnContext(null);

    const destination = !isMobile ? (returnCtx?.activeView || options?.searchOrigin || "status") : "map";
    const stationToRestore = options?.stationToRestore ?? ((returnCtx && returnCtx.selectedNetwork === selectedNetwork) ? returnCtx.selectedStationId : null);

    if (destination === "commutes" && returnCtx?.commutesActiveTab && options?.commutesTabRestorer) {
      options.commutesTabRestorer(returnCtx.commutesActiveTab);
    }

    const finishClose = () => {
      setIsClosingSearch(false);
      if (stationToRestore) {
        selectedStationIdRef.current = stationToRestore;
        setSelectedStationId(stationToRestore);
      }
      navigateRoot(destination);
      if (returnCtx?.focusedElement && typeof document !== "undefined" && document.contains(returnCtx.focusedElement)) {
        returnCtx.focusedElement.focus();
      }
    };

    if (reducedMotion) {
      if (searchClosingTimeoutRef.current) {
        window.clearTimeout(searchClosingTimeoutRef.current);
        searchClosingTimeoutRef.current = null;
      }
      finishClose();
      return;
    }

    setIsClosingSearch(true);
    if (searchClosingTimeoutRef.current) window.clearTimeout(searchClosingTimeoutRef.current);
    searchClosingTimeoutRef.current = window.setTimeout(() => {
      finishClose();
      searchClosingTimeoutRef.current = null;
    }, isMobile ? 220 : 200);
  }, [isClosingSearch, isMobile, navigateRoot, reducedMotion, selectedNetwork]);

  // Search Select Station
  const handleSearchSelectStation = useCallback((stationId: string, networkId: NetworkId) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);

    if (networkId === selectedNetwork) {
      handleSelectStationId(stationId);
      return;
    }

    pushBrowserNavigationEntry();
    if (activeViewRef.current !== "map") {
      viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, activeViewRef.current, "map" as ActiveView);
      setViewHistory(viewHistoryRef.current);
      activeViewRef.current = "map";
      setActiveView("map");
    }
    crossNetworkStationSelectionRef.current = { networkId, stationId };
    onRecordPwaEngagement?.();
    onNetworkChange(networkId);
  }, [handleSelectStationId, onNetworkChange, onRecordPwaEngagement, pushBrowserNavigationEntry, selectedNetwork]);

  // Apply Network Change
  const applyNetworkChange = useCallback((networkId: NetworkId) => {
    impactHistoryRef.current = [];
    setImpactHistory([]);
    const pending = crossNetworkStationSelectionRef.current?.networkId === networkId
      ? crossNetworkStationSelectionRef.current
      : null;
    crossNetworkStationSelectionRef.current = null;

    if (pending) {
      selectedStationIdRef.current = pending.stationId;
      setSelectedStationId(pending.stationId);
      setStationPanelActivationKey((current) => current + 1);
    } else {
      selectedStationIdRef.current = null;
      setSelectedStationId(null);
    }

    selectionRef.current = null;
    setSelection(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    setAccessibilityOutageTarget(null);
    stationDrilldownOriginRef.current = null;
  }, []);

  // Popstate Listener
  const handlePopState = useEffectEvent((event: PopStateEvent) => {
    const navState = event.state?.[BROWSER_NAVIGATION_STATE_KEY] as BrowserNavigationState | undefined;
    browserNavigationDepthRef.current = navState?.sessionId === browserNavigationSessionRef.current ? navState.depth : 0;

    if (suppressedPopstateCountRef.current > 0) {
      suppressedPopstateCountRef.current -= 1;
      return;
    }

    setNavDirection("back");
    onResetMapPresentation?.();
    onSetMobileInspectorDetent?.("map-focus");

    if (accountDialogOpen) {
      onCloseAccountDialog();
      return;
    }

    const currentState = getCurrentNavigationState();
    const backResult = transitionBrowserBack(currentState, {
      isMobile,
      accountDialogOpen,
    });
    if (impactReturnContext(currentState) && !currentState.selectedStationId && !currentState.commutePathPreview && !currentState.stationDrilldownOrigin) {
      applyImpactBack(backResult.nextState);
      return;
    }

    switch (backResult.actionTaken) {
      case "close-account-dialog":
        onCloseAccountDialog();
        return;

      case "close-station":
        selectedStationIdRef.current = null;
        setSelectedStationId(null);
        if (stationDrilldownOriginRef.current) {
          handleSubmenuBack();
        }
        return;

      case "close-commute-preview":
        if (commutePathPreviewRef.current) {
          setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
        }
        commutePathPreviewRef.current = null;
        setCommutePathPreview(null);
        selectionRef.current = null;
        setSelection(null);
        activeViewRef.current = "commutes";
        setActiveView("commutes");
        return;

      case "navigate-view":
        if (stationDrilldownOriginRef.current) {
          const originStationId = stationDrilldownOriginRef.current;
          stationDrilldownOriginRef.current = null;
          viewHistoryRef.current = [];
          setViewHistory([]);
          activeViewRef.current = "map";
          setActiveView("map");
          selectionRef.current = null;
          setSelection(null);
          setSelectionBackBehavior("clear");
          selectionBackBehaviorRef.current = "clear";
          setAccessibilityOutageTarget(null);
          selectedStationIdRef.current = originStationId;
          setSelectedStationId(originStationId);
          return;
        }
        if (selectionRef.current && selectionBackBehaviorRef.current === "clear" && !commutePathPreviewRef.current) {
          selectionRef.current = null;
          setSelection(null);
          return;
        }
        if (commutePathPreviewRef.current) {
          setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
          commutePathPreviewRef.current = null;
          setCommutePathPreview(null);
          setActiveView("commutes");
          activeViewRef.current = "commutes";
          selectionRef.current = null;
          setSelection(null);
          setSelectionBackBehavior("clear");
          selectionBackBehaviorRef.current = "clear";
          setAccessibilityOutageTarget(null);
          return;
        }

        const previous = { view: backResult.nextState.activeView, history: backResult.nextState.viewHistory };
        if (commutePathPreviewRef.current && previous.view === "commutes") {
          commutePathPreviewRef.current = null;
          setCommutePathPreview(null);
        }
        viewHistoryRef.current = backResult.nextState.viewHistory;
        setViewHistory(backResult.nextState.viewHistory);
        activeViewRef.current = backResult.nextState.activeView;
        setActiveView(backResult.nextState.activeView);
        if (backResult.nextState.activeView !== "map") {
          selectionRef.current = null;
          setSelection(null);
          setSelectionBackBehavior("clear");
          selectionBackBehaviorRef.current = "clear";
        }
        setAccessibilityOutageTarget(null);
        return;

      case "clear-impact":
        selectionRef.current = null;
        setSelection(null);
        if (selectionBackBehaviorRef.current === "restore-view") {
          handleSubmenuBack();
        }
        setSelectionBackBehavior("clear");
        selectionBackBehaviorRef.current = "clear";
        return;

      case "none":
        return;
    }
  });

  useEffect(() => {
    const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    browserNavigationSessionRef.current = sessionId;
    browserNavigationDepthRef.current = 0;
    window.history.replaceState({
      ...window.history.state,
      [BROWSER_NAVIGATION_STATE_KEY]: { sessionId, depth: 0 } satisfies BrowserNavigationState,
    }, "", currentBrowserLocalPath());

    const listener = (event: PopStateEvent) => handlePopState(event);
    window.addEventListener("popstate", listener);
    return () => {
      window.removeEventListener("popstate", listener);
      browserNavigationSessionRef.current = "";
    };
  }, []);

  // Desktop Escape Listener
  useEffect(() => {
    if (isMobile) return;

    const handleDesktopKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']")) {
        return;
      }

      if (activeViewRef.current === "search" || isSearchFocused?.()) {
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (onDesktopEscapeSearch) {
          onDesktopEscapeSearch();
        } else {
          handleCloseSearch();
        }
        return;
      }

      if (selectedStationIdRef.current) {
        event.preventDefault();
        closeSelectedStation(selectedStationIdRef.current);
        return;
      }

      if (selectionRef.current) {
        event.preventDefault();
        selectionRef.current = null;
        setSelection(null);
        return;
      }

      if (isStatusSubView(activeViewRef.current) || activeViewRef.current === "notifications" || activeViewRef.current === "release-notes" || activeViewRef.current === "alert-history" || activeViewRef.current === "privacy-acknowledgements") {
        event.preventDefault();
        handleSubmenuBack();
      }
    };

    window.addEventListener("keydown", handleDesktopKeyDown);
    return () => window.removeEventListener("keydown", handleDesktopKeyDown);
  }, [closeSelectedStation, handleCloseSearch, handleSubmenuBack, isMobile, isSearchFocused, onDesktopEscapeSearch]);

  const { destination: searchReturnDestination, label: searchReturnLabel } = searchReturnDestinationAndLabel(searchReturnContext);

  return {
    // Navigation state
    activeView,
    viewHistory,
    navDirection,
    selectedStationId,
    selection,
    selectionBackBehavior,
    commutePathPreview,
    commutesFocusedCommuteId,
    searchReturnContext,
    searchReturnDestination,
    searchReturnLabel,
    stationPanelActivationKey,
    selectionAttentionGeneration,
    mobileImpactReturnView,
    impactBackContext: impactReturnContext({ activeView, selection, impactHistory }),

    // Feature launches & targets
    impactListLaunch,
    lineImpactLaunch,
    accessibilityOutageTarget,
    surfaceNoticeInitialQuery,
    surfaceNoticeInitialId,
    surfaceNoticeInitialContent,

    // Animation & delay flags
    isClosingPanel,
    isGoingBack,
    isClosingSearch,

    // Ref access for race protection and inspection
    activeViewRef,
    viewHistoryRef,
    selectedStationIdRef,
    stationDrilldownOriginRef,
    selectionRef,
    selectionBackBehaviorRef,
    commutePathPreviewRef,
    searchReturnContextRef,
    crossNetworkStationSelectionRef,
    browserNavigationDepthRef,
    viewScrollPositionsRef,

    // Command handlers
    navigateRoot,
    navigateForward,
    handleClosePanel,
    handleSubmenuBack,
    handleSelectStationId,
    closeSelectedStation,
    handleMapSelectImpact,
    handleSelectImpactDetails,
    dismissImpactNavigation,
    handleStationSelectImpact,
    previewCommute,
    clearCommutePreview,
    openImpactCategory,
    openLineImpacts,
    openAccessibilityOutage,
    captureSearchReturnContext,
    handleCloseSearch,
    handleSearchSelectStation,
    applyNetworkChange,
    navigateToMapDrilldown,
    restorePreviousView,
    restoreMapDrilldownOrigin,
    pushBrowserNavigationEntry,
    consumeBrowserNavigationEntries,

    // Setters & refs
    setActiveView,
    setSelectedStationId,
    setSelection,
    setSelectionBackBehavior,
    setCommutePathPreview,
    setCommutesFocusedCommuteId,
    setStationPanelActivationKey,
    setSelectionAttentionGeneration,
    setImpactListLaunch,
    setLineImpactLaunch,
    setIsClosingSearch,
    searchClosingTimeoutRef,
    setAccessibilityOutageTarget,
    setSurfaceNoticeInitialQuery,
    setSurfaceNoticeInitialId,
    setSurfaceNoticeInitialContent,
    setMobileImpactReturnView,
  };
}
