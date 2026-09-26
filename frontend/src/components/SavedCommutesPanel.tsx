"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, Navigation, Plus, Search } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import type { AccountState } from "../app/auth-data.ts";
import {
  createSavedCommute,
  defaultSavedCommuteNotificationRule,
  deleteSavedCommute,
  sortSavedCommutes,
  summarizeSavedCommuteStatuses,
  updateSavedCommute,
  updateSavedCommuteNotificationRule,
  type AccountCommuteLegId,
  type AccountMatchedImpact,
  type AccountSavedCommute,
  type AccountSavedCommuteNotificationRule,
  type SavedCommuteSort,
} from "../app/commute-data.ts";
import {
  type SavedCommuteDraft,
  persistedCommuteDraftStore,
  persistedExpandedImpactDisclosures,
  setPersistedCommuteDraft,
} from "../app/commute-draft-state.ts";
import {
  cloneNotificationRule,
  hasInvalidNotificationSchedule,
  ruleForCommute,
  scopeNotificationRuleToNetwork,
} from "../app/commute-notification-edit-model.ts";
import type { NetworkId } from "../app/regional-data.ts";
import type { StationSummary } from "../app/station-data.ts";
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";
import { PanelHeader } from "./PanelHeader";
import { SavedCommuteCard } from "./SavedCommuteCard";
import { SavedCommuteRouteDraftEditor } from "./SavedCommuteRouteDraftEditor";

// drawer-layout.test.mjs compatibility: grid-cols-1
// drawer-layout.test.mjs compatibility: flex-wrap

import { toTitleCase } from "../app/text-format";
export { toTitleCase };

const COMMUTE_SORT_OPTIONS: Array<ToolbarSelectOption<SavedCommuteSort>> = [
  { value: "impact", label: "Most Affected" },
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "name", label: "Route Name A–Z" },
];

export type AccountNetworkFilter = "all" | NetworkId;

export const ACCOUNT_NETWORK_OPTIONS: Array<{ value: AccountNetworkFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ttc", label: "TTC" },
  { value: "regional", label: "GO & UP" },
];

interface Props {
  onBack?: () => void;
  onClose?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationCatalogs: Record<NetworkId, StationSummary[]>;
  networkId: NetworkId;
  viewedCommuteId?: string | null;
  focusedCommuteId?: string | null;
  onFocusedCommuteIdChange?: (id: string | null) => void;
  onViewPath: (commute: AccountSavedCommute, legId?: AccountCommuteLegId) => void;
  onViewImpactOnPath: (commute: AccountSavedCommute, legId: AccountCommuteLegId, impact: AccountMatchedImpact) => void;
  onClearViewedPath: (commuteId: string) => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
  activeView?: "create" | "saved";
  onActiveViewChange?: (view: "create" | "saved") => void;
  sortBy?: SavedCommuteSort;
  onSortByChange?: (sort: SavedCommuteSort) => void;
  networkFilter?: AccountNetworkFilter;
  onNetworkFilterChange?: (filter: AccountNetworkFilter) => void;
  selectedLegIds?: Record<string, AccountCommuteLegId>;
  onSelectedLegIdsChange?: (
    updater:
      | Record<string, AccountCommuteLegId>
      | ((prev: Record<string, AccountCommuteLegId>) => Record<string, AccountCommuteLegId>),
  ) => void;
  expandedCommuteId?: string | null;
  onExpandedCommuteIdChange?: (updater: string | null | ((prev: string | null) => string | null)) => void;
  expandedImpactDisclosures?: Record<string, boolean>;
  onToggleImpactDisclosure?: (key: string, isOpen: boolean) => void;
  draft?: SavedCommuteDraft | null;
  onDraftChange?: (draft: SavedCommuteDraft | null) => void;
}

export function SavedCommutesPanel({
  onBack,
  onClose,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationCatalogs,
  networkId,
  viewedCommuteId,
  focusedCommuteId: propFocusedCommuteId,
  onFocusedCommuteIdChange,
  onViewPath,
  onViewImpactOnPath,
  onClearViewedPath,
  onRequestSignIn,
  onRequestCreateAccount,
  onOpenNotificationSettings,
  notificationSummary,
  activeView: propActiveView,
  onActiveViewChange,
  sortBy: propSortBy,
  onSortByChange,
  networkFilter: propNetworkFilter,
  onNetworkFilterChange,
  selectedLegIds: propSelectedLegIds,
  onSelectedLegIdsChange,
  expandedCommuteId: propExpandedCommuteId,
  onExpandedCommuteIdChange,
  expandedImpactDisclosures: propExpandedImpactDisclosures,
  onToggleImpactDisclosure,
  draft: propDraft,
  onDraftChange,
}: Props) {
  const dashboard = useDashboardData();
  const lastInteractedCommuteIdRef = useRef<string | null>(null);
  const deleteConfirmationRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [internalExpandedImpactDisclosures, setInternalExpandedImpactDisclosures] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const key of persistedExpandedImpactDisclosures) {
        initial[key] = true;
      }
      return initial;
    },
  );
  const expandedImpactDisclosures = propExpandedImpactDisclosures ?? internalExpandedImpactDisclosures;

  const handleToggleImpactDisclosure = (key: string, isOpen: boolean) => {
    if (isOpen) {
      persistedExpandedImpactDisclosures.add(key);
    } else {
      persistedExpandedImpactDisclosures.delete(key);
    }
    if (onToggleImpactDisclosure) {
      onToggleImpactDisclosure(key, isOpen);
    } else {
      setInternalExpandedImpactDisclosures((prev) => ({ ...prev, [key]: isOpen }));
    }
  };

  const [internalFocusedCommuteId, setInternalFocusedCommuteId] = useState<string | null>(null);
  const focusedCommuteId = propFocusedCommuteId !== undefined ? propFocusedCommuteId : internalFocusedCommuteId;
  const setFocusedCommuteId = (id: string | null) => {
    if (onFocusedCommuteIdChange) {
      onFocusedCommuteIdChange(id);
    } else {
      setInternalFocusedCommuteId(id);
    }
  };

  const handleViewImpactOnPath = (
    commute: AccountSavedCommute,
    legId: AccountCommuteLegId,
    impact: AccountMatchedImpact,
  ) => {
    const key = `${commute.id}-${legId}`;
    persistedExpandedImpactDisclosures.add(key);
    if (onToggleImpactDisclosure) {
      onToggleImpactDisclosure(key, true);
    } else {
      setInternalExpandedImpactDisclosures((prev) => ({ ...prev, [key]: true }));
    }
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
    onViewImpactOnPath(commute, legId, impact);
  };

  const initialDraft = propDraft ?? persistedCommuteDraftStore.current;
  const [newLabel, setNewLabel] = useState(() => initialDraft?.newLabel ?? "");
  const [editingCommuteId, setEditingCommuteId] = useState<string | null>(() => initialDraft?.editingCommuteId ?? null);
  const [originStationId, setOriginStationId] = useState(() => initialDraft?.originStationId ?? "");
  const [destinationStationId, setDestinationStationId] = useState(() => initialDraft?.destinationStationId ?? "");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(() => initialDraft?.commuteError ?? null);
  const [watchReturnTrip, setWatchReturnTrip] = useState(() => initialDraft?.watchReturnTrip ?? true);
  const [internalExpandedCommuteId, setInternalExpandedCommuteId] = useState<string | null>(null);
  const expandedCommuteId = propExpandedCommuteId !== undefined ? propExpandedCommuteId : internalExpandedCommuteId;
  const setExpandedCommuteId = (updater: string | null | ((prev: string | null) => string | null)) => {
    if (onExpandedCommuteIdChange) {
      onExpandedCommuteIdChange(updater);
    } else {
      setInternalExpandedCommuteId(updater);
    }
  };
  const [deletingCommuteId, setDeletingCommuteId] = useState<string | null>(null);
  const [userToggledCommuteIds, setUserToggledCommuteIds] = useState<Record<string, number>>({});
  const swapAnimationTimeoutsRef = useRef<Record<string, number>>({});

  const clearCommuteSwapAnimation = (commuteId?: string) => {
    if (commuteId) {
      if (swapAnimationTimeoutsRef.current[commuteId] !== undefined) {
        window.clearTimeout(swapAnimationTimeoutsRef.current[commuteId]);
        delete swapAnimationTimeoutsRef.current[commuteId];
      }
      setUserToggledCommuteIds((prev) => {
        if (!prev[commuteId]) return prev;
        const next = { ...prev };
        delete next[commuteId];
        return next;
      });
    } else {
      Object.values(swapAnimationTimeoutsRef.current).forEach((timerId) => window.clearTimeout(timerId));
      swapAnimationTimeoutsRef.current = {};
      setUserToggledCommuteIds({});
    }
  };

  const [internalSelectedLegIds, setInternalSelectedLegIds] = useState<Record<string, AccountCommuteLegId>>({});
  const selectedLegIds = propSelectedLegIds ?? internalSelectedLegIds;
  const setSelectedLegIds = (
    updater:
      | Record<string, AccountCommuteLegId>
      | ((prev: Record<string, AccountCommuteLegId>) => Record<string, AccountCommuteLegId>),
  ) => {
    if (onSelectedLegIdsChange) {
      onSelectedLegIdsChange(updater);
    } else {
      setInternalSelectedLegIds(updater);
    }
  };

  const handleToggleLeg = (
    commuteId: string,
    nextLegId: AccountCommuteLegId,
    currentLegId: AccountCommuteLegId,
  ) => {
    if (nextLegId === currentLegId) return;

    setSelectedLegIds((current) => ({ ...current, [commuteId]: nextLegId }));

    if (swapAnimationTimeoutsRef.current[commuteId] !== undefined) {
      window.clearTimeout(swapAnimationTimeoutsRef.current[commuteId]);
      delete swapAnimationTimeoutsRef.current[commuteId];
    }

    setUserToggledCommuteIds((prev) => ({
      ...prev,
      [commuteId]: (prev[commuteId] || 0) + 1,
    }));

    swapAnimationTimeoutsRef.current[commuteId] = window.setTimeout(() => {
      clearCommuteSwapAnimation(commuteId);
    }, 550);
  };

  const [activePicker, setActivePicker] = useState<"origin" | "destination" | null>(null);
  const [activeViewInternal, setActiveViewInternal] = useState<"create" | "saved">("create");
  const activeView = propActiveView ?? activeViewInternal;
  const [internalNavDirection, setInternalNavDirection] = useState<"forward" | "back" | null>(null);
  const prevActiveViewRef = useRef(activeView);
  useEffect(() => {
    if (prevActiveViewRef.current !== activeView) {
      setInternalNavDirection(activeView === "create" ? "forward" : "back");
      prevActiveViewRef.current = activeView;
    }
  }, [activeView]);

  const setActiveView = (view: "create" | "saved") => {
    setInternalNavDirection(view === "create" ? "forward" : "back");
    if (view !== "saved") {
      clearCommuteSwapAnimation();
    }
    setActiveViewInternal(view);
    onActiveViewChange?.(view);
  };

  useEffect(() => {
    return () => {
      Object.values(swapAnimationTimeoutsRef.current).forEach((timerId) => window.clearTimeout(timerId));
      swapAnimationTimeoutsRef.current = {};
    };
  }, []);

  const [newNotificationRule, setNewNotificationRule] = useState<AccountSavedCommuteNotificationRule>(() =>
    initialDraft?.newNotificationRule
      ? cloneNotificationRule(initialDraft.newNotificationRule)
      : cloneNotificationRule(defaultSavedCommuteNotificationRule),
  );
  const [showNotificationSettings, setShowNotificationSettings] = useState(
    () => initialDraft?.showNotificationSettings ?? false,
  );
  const [showRoutingDisclaimer, setShowRoutingDisclaimer] = useState(
    () => initialDraft?.showRoutingDisclaimer ?? false,
  );
  const [editingNotificationCommuteId, setEditingNotificationCommuteId] = useState<string | null>(null);
  const [notificationDrafts, setNotificationDrafts] = useState<Record<string, AccountSavedCommuteNotificationRule>>({});
  const [savingNotificationRuleId, setSavingNotificationRuleId] = useState<string | null>(null);
  const [notificationRuleError, setNotificationRuleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [internalSortBy, setInternalSortBy] = useState<SavedCommuteSort>("impact");
  const sortBy = propSortBy ?? internalSortBy;
  const setSortBy = (nextSort: SavedCommuteSort) => {
    if (onSortByChange) {
      onSortByChange(nextSort);
    } else {
      setInternalSortBy(nextSort);
    }
  };
  const [internalNetworkFilter, setInternalNetworkFilter] = useState<AccountNetworkFilter>("all");
  const networkFilter = propNetworkFilter ?? internalNetworkFilter;
  const setNetworkFilter = (nextFilter: AccountNetworkFilter) => {
    if (onNetworkFilterChange) {
      onNetworkFilterChange(nextFilter);
    } else {
      setInternalNetworkFilter(nextFilter);
    }
  };
  const [draftNetworkId, setDraftNetworkId] = useState<NetworkId>(() => initialDraft?.draftNetworkId ?? networkId);

  useEffect(() => {
    if (activeView === "create") {
      const nextDraft: SavedCommuteDraft = {
        newLabel,
        editingCommuteId,
        originStationId,
        destinationStationId,
        watchReturnTrip,
        newNotificationRule,
        showNotificationSettings,
        showRoutingDisclaimer,
        draftNetworkId,
        commuteError,
      };
      setPersistedCommuteDraft(nextDraft);
      onDraftChange?.(nextDraft);
    }
  }, [
    activeView,
    newLabel,
    editingCommuteId,
    originStationId,
    destinationStationId,
    watchReturnTrip,
    newNotificationRule,
    showNotificationSettings,
    showRoutingDisclaimer,
    draftNetworkId,
    commuteError,
    onDraftChange,
  ]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const stationSummaries = stationCatalogs[draftNetworkId];
  const stationNameFor = useCallback(
    (stationId: string, commuteNetworkId: NetworkId) => {
      return stationCatalogs[commuteNetworkId]?.find((station) => station.id === stationId)?.name ?? stationId;
    },
    [stationCatalogs],
  );

  const visibleCommutes = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return accountCommutes.filter((commute) => {
      const matchesNetwork = networkFilter === "all" || (commute.networkId ?? "ttc") === networkFilter;
      if (!matchesNetwork) return false;
      if (!trimmedQuery) return true;
      const originName = stationNameFor(commute.originStationId, commute.networkId ?? "ttc").toLowerCase();
      const destName = stationNameFor(commute.destinationStationId, commute.networkId ?? "ttc").toLowerCase();
      return (
        commute.label.toLowerCase().includes(trimmedQuery) ||
        originName.includes(trimmedQuery) ||
        destName.includes(trimmedQuery)
      );
    });
  }, [accountCommutes, networkFilter, query, stationNameFor]);

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(visibleCommutes),
    [visibleCommutes],
  );

  const { clear: allCommuteClearCount, affectedNow: allCommuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(accountCommutes),
    [accountCommutes],
  );

  const sortedCommutes = useMemo(() => sortSavedCommutes(visibleCommutes, sortBy), [visibleCommutes, sortBy]);

  useEffect(() => {
    if (activeView !== "saved") return;
    const rawTarget = focusedCommuteId || lastInteractedCommuteIdRef.current || viewedCommuteId;
    if (!rawTarget) return;
    const targetId = rawTarget.replace(/-(outbound|return)$/, "");
    if (!targetId) return;

    let timeoutId: number | undefined;
    let animationFrameId: number | undefined;

    const scrollToCard = () => {
      const card = document.querySelector<HTMLElement>(`[data-commute-card-id="${CSS.escape(targetId)}"]`);
      if (!card) return false;

      card.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
      return true;
    };

    if (!scrollToCard()) {
      animationFrameId = window.requestAnimationFrame(() => {
        if (!scrollToCard()) {
          timeoutId = window.setTimeout(scrollToCard, 100);
        }
      });
    } else {
      timeoutId = window.setTimeout(scrollToCard, 80);
    }

    const postAnimationTimeoutId = window.setTimeout(scrollToCard, 280);

    return () => {
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (postAnimationTimeoutId !== undefined) window.clearTimeout(postAnimationTimeoutId);
    };
  }, [activeView, focusedCommuteId, viewedCommuteId, sortedCommutes]);

  useEffect(() => {
    if (!deletingCommuteId || !window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return;

    const frame = window.requestAnimationFrame(() => {
      const confirmation = deleteConfirmationRef.current;
      if (!confirmation) return;

      const confirmationRect = confirmation.getBoundingClientRect();
      const scrollContainer = confirmation.closest<HTMLElement>(".commute-grid");
      const scrollRect = scrollContainer?.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
      const visibleTop = Math.max(viewportTop, scrollRect?.top ?? viewportTop);
      const visibleBottom = Math.min(viewportBottom, scrollRect?.bottom ?? viewportBottom);
      const revealInset = 12;
      const bottomOverflow = confirmationRect.bottom + revealInset - visibleBottom;
      const topOverflow = visibleTop + revealInset - confirmationRect.top;

      if (bottomOverflow <= 0 && topOverflow <= 0) return;

      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      const top = bottomOverflow > 0 ? bottomOverflow : -topOverflow;
      (scrollContainer ?? window).scrollBy({
        behavior,
        top,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [deletingCommuteId]);

  const resetRouteDraft = () => {
    setPersistedCommuteDraft(null);
    onDraftChange?.(null);
    setNewLabel("");
    setOriginStationId("");
    setDestinationStationId("");
    setWatchReturnTrip(true);
    setEditingCommuteId(null);
    setDraftNetworkId(networkId);
    setShowRoutingDisclaimer(false);
    setShowNotificationSettings(false);
    setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
    setCommuteError(null);
    clearCommuteSwapAnimation();
  };

  const startCreatingCommute = () => {
    resetRouteDraft();
    setDraftNetworkId(networkId);
    setCommuteError(null);
    clearCommuteSwapAnimation();
    setQuery("");
    setActiveView("create");
  };

  const handleSaveCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
      return;
    }
    if (originStationId === destinationStationId) {
      setCommuteError("Choose two different stations.");
      return;
    }
    if (hasInvalidNotificationSchedule(newNotificationRule)) {
      setCommuteError("Choose different start and end times for each custom notification window.");
      return;
    }
    setSaving(true);
    setCommuteError(null);
    try {
      const saved = editingCommuteId
        ? await updateSavedCommute(editingCommuteId, {
            label: newLabel,
            originStationId,
            destinationStationId,
            watchReturnTrip,
          })
        : await createSavedCommute({
            label: newLabel,
            networkId: draftNetworkId,
            originStationId,
            destinationStationId,
            watchReturnTrip,
            notificationRule: scopeNotificationRuleToNetwork(newNotificationRule, draftNetworkId),
          });
      const targetCommuteId = editingCommuteId ?? saved.id;
      setAccountCommutes(
        editingCommuteId
          ? accountCommutes.map((commute) => (commute.id === saved.id ? saved : commute))
          : [...accountCommutes, saved],
      );
      resetRouteDraft();
      setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
      setSuccessMessage(editingCommuteId ? "Commute Updated Successfully" : "Commute Saved Successfully");
      setToastKey((prev) => prev + 1);
      lastInteractedCommuteIdRef.current = targetCommuteId;
      setFocusedCommuteId(targetCommuteId);
      clearCommuteSwapAnimation();
      setActiveView("saved");
    } catch (error) {
      setCommuteError(error instanceof Error ? error.message : "Could not save that commute.");
    } finally {
      setSaving(false);
    }
  };

  const startEditingCommute = (commute: AccountSavedCommute) => {
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
    setEditingCommuteId(commute.id);
    setNewLabel(commute.label);
    setOriginStationId(commute.originStationId);
    setDestinationStationId(commute.destinationStationId);
    setWatchReturnTrip(commute.watchReturnTrip);
    setDraftNetworkId(commute.networkId ?? "ttc");
    setShowNotificationSettings(false);
    setShowRoutingDisclaimer(false);
    setCommuteError(null);
    clearCommuteSwapAnimation(commute.id);
    setActiveView("create");
  };

  const handleDeleteCommute = async (id: string) => {
    try {
      await deleteSavedCommute(id);
      setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
      if (viewedCommuteId === id) {
        onClearViewedPath(id);
      }
      if (focusedCommuteId === id) {
        setFocusedCommuteId(null);
      }
      if (lastInteractedCommuteIdRef.current === id) {
        lastInteractedCommuteIdRef.current = null;
      }
      clearCommuteSwapAnimation(id);
      setExpandedCommuteId((current) => (current === id ? null : current));
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };

  function startEditingNotificationRule(commute: AccountSavedCommute) {
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
    setNotificationRuleError(null);
    setEditingNotificationCommuteId(commute.id);
    setNotificationDrafts((current) => ({
      ...current,
      [commute.id]: ruleForCommute(commute),
    }));
  }

  function updateNotificationDraft(commuteId: string, rule: AccountSavedCommuteNotificationRule) {
    setNotificationDrafts((current) => ({
      ...current,
      [commuteId]: rule,
    }));
  }

  async function saveNotificationRule(commute: AccountSavedCommute) {
    const draft = scopeNotificationRuleToNetwork(
      notificationDrafts[commute.id] ?? ruleForCommute(commute),
      commute.networkId ?? "ttc",
    );
    if (hasInvalidNotificationSchedule(draft)) {
      setNotificationRuleError("Choose different start and end times for each custom notification window.");
      return;
    }
    setSavingNotificationRuleId(commute.id);
    setNotificationRuleError(null);
    try {
      const updated = await updateSavedCommuteNotificationRule(commute.id, draft);
      setAccountCommutes(accountCommutes.map((item) => (item.id === updated.id ? updated : item)));
      setEditingNotificationCommuteId(null);
      setNotificationDrafts((current) => {
        const next = { ...current };
        delete next[commute.id];
        return next;
      });
    } catch {
      setNotificationRuleError("Could not save route notification rules.");
    } finally {
      setSavingNotificationRuleId(null);
    }
  }

  if (dashboard.snapshot) {
    return (
      <section className="commute-panel min-w-0 rounded-lg">
        <PanelHeader title="My Commutes" titleCompact onBack={onBack} onClose={onClose} />
        <div className="p-4 space-y-3">
          <p role="status">
            Current commute impacts and travel-time estimates are unavailable. Reconnect to check your routes.
          </p>
          {accountCommutes.map((commute) => (
            <p key={commute.id} className="font-semibold">
              {commute.label}
            </p>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="commute-panel min-w-0 border border-transparent rounded-lg shadow-xl">
      <PanelHeader
        title="My Commutes"
        titleCompact
        icon={<Navigation className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />}
        titleBadge={
          accountState.user?.demo ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Demo account
            </span>
          ) : null
        }
        actions={
          accountState.authenticated && accountCommutes.length > 0 ? (
            <div className="flex items-center gap-1.5 shrink-0" data-testid="header-commute-status-badges">
              <span
                className={`desktop-menu-count-badge desktop-menu-count-commutes-clear flex h-7 ${
                  allCommuteClearCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allCommuteClearCount < 10 ? "true" : undefined}
                aria-label={`${allCommuteClearCount} clear commutes`}
              >
                {allCommuteClearCount}
              </span>
              <span
                className={`desktop-menu-count-badge desktop-menu-count-commutes-affected flex h-7 ${
                  allCommuteAffectedCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allCommuteAffectedCount < 10 ? "true" : undefined}
                aria-label={`${allCommuteAffectedCount} affected commutes`}
              >
                {allCommuteAffectedCount}
              </span>
            </div>
          ) : null
        }
        onBack={
          onBack
            ? () => {
                if (activePicker) {
                  setActivePicker(null);
                } else if (activeView === "create") {
                  if (editingCommuteId) {
                    lastInteractedCommuteIdRef.current = editingCommuteId;
                  }
                  clearCommuteSwapAnimation();
                  resetRouteDraft();
                  setActiveView("saved");
                  setCommuteError(null);
                } else {
                  onBack();
                }
              }
            : undefined
        }
        onClose={
          onClose
            ? () => {
                if (activePicker) {
                  setActivePicker(null);
                } else {
                  onClose();
                }
              }
            : undefined
        }
      />
      <div
        key={activeView}
        className="commute-body flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
        data-nav-direction={internalNavDirection || undefined}
      >
        {accountState.source === "unavailable" ? (
          <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
            <AccountAvailabilityNotice
              knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null}
            />
          </div>
        ) : !accountState.authenticated ? (
          <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
            <div className="account-feature-preview saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-transparent">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M18.9922 8.07411C18.7683 8.30212 18.5423 8.50328 18.3375 8.67188C18.1401 8.50899 17.9227 8.31226 17.7078 8.08774C16.9853 7.333 16.5 6.48786 16.5 5.6875C16.5 4.59138 17.3653 3.75 18.375 3.75C19.3847 3.75 20.25 4.59138 20.25 5.6875C20.25 6.46225 19.7514 7.30076 18.9922 8.07411ZM21.75 5.6875C21.75 8.4375 18.375 10.5 18.375 10.5C18.2063 10.5 15 8.4375 15 5.6875C15 3.78902 16.511 2.25 18.375 2.25C20.239 2.25 21.75 3.78902 21.75 5.6875ZM3.75 9C3.75 10.2426 4.75736 11.25 6 11.25H18C20.0711 11.25 21.75 12.9289 21.75 15C21.75 17.0711 20.0711 18.75 18 18.75H9.75V17.25H18C19.2426 17.25 20.25 16.2426 20.25 15C20.25 13.7574 19.2426 12.75 18 12.75H6C3.92893 12.75 2.25 11.0711 2.25 9C2.25 6.92893 3.92893 5.25 6 5.25L14.25 5.25V6.75L6 6.75C4.75736 6.75 3.75 7.75736 3.75 9ZM6.24215 19.3241C6.01829 19.5521 5.79234 19.7533 5.58752 19.9219C5.39011 19.759 5.1727 19.5623 4.95777 19.3377C4.23528 18.583 3.75 17.7379 3.75 16.9375C3.75 15.8414 4.61529 15 5.625 15C6.63471 15 7.5 15.8414 7.5 16.9375C7.5 17.7123 7.00145 18.5508 6.24215 19.3241ZM9 16.9375C9 19.6875 5.625 21.75 5.625 21.75C5.45625 21.75 2.25 19.6875 2.25 16.9375C2.25 15.039 3.76104 13.5 5.625 13.5C7.48896 13.5 9 15.039 9 16.9375ZM6.75 16.875C6.75 17.4963 6.24632 18 5.625 18C5.00368 18 4.5 17.4963 4.5 16.875C4.5 16.2537 5.00368 15.75 5.625 15.75C6.24632 15.75 6.75 16.2537 6.75 16.875ZM18.375 6.75C18.9963 6.75 19.5 6.24632 19.5 5.625C19.5 5.00368 18.9963 4.5 18.375 4.5C17.7537 4.5 17.25 5.00368 17.25 5.625C17.25 6.24632 17.7537 6.75 18.375 6.75Z"
                      fill="currentColor"
                    />
                  </svg>
                  Track Your Daily Commute
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Unlock personalized tracking and route impact checks for your daily{" "}
                  {networkId === "regional" ? "GO and UP" : "subway and LRT"} routes.
                </p>
              </div>

              <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Personalized Route Pathing
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Save custom origin-destination pairs on the selected LineWatchTO rail network.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Direction-Aware Impact Matching
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      See fresh dashboard-visible disruptions that match the stations, segments, or corridors on your
                      route.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Return Leg Monitoring
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Easily toggle and monitor your reverse return leg in the same view.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Route Impact Alerts
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Receive route impact alerts when notifications are enabled and the selected network source is fresh.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Free</span>
                  </div>
                </div>
              </div>

              <div className="account-action-row mt-1">
                <button type="button" onClick={onRequestSignIn}>
                  Sign In
                </button>
                <button type="button" onClick={onRequestCreateAccount} className="saved-commute-signup-btn">
                  Create Account
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {accountState.source === "backend" && accountState.authenticated ? (
          <>
            {activeView === "create" ? (
              <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
                <SavedCommuteRouteDraftEditor
                  editingCommuteId={editingCommuteId}
                  draftNetworkId={draftNetworkId}
                  onDraftNetworkIdChange={(netId) => {
                    setDraftNetworkId(netId);
                    setOriginStationId("");
                    setDestinationStationId("");
                    setActivePicker(null);
                  }}
                  newLabel={newLabel}
                  onLabelChange={setNewLabel}
                  originStationId={originStationId}
                  onOriginStationIdChange={setOriginStationId}
                  destinationStationId={destinationStationId}
                  onDestinationStationIdChange={setDestinationStationId}
                  stationSummaries={stationSummaries}
                  activePicker={activePicker}
                  onActivePickerChange={setActivePicker}
                  watchReturnTrip={watchReturnTrip}
                  onWatchReturnTripChange={setWatchReturnTrip}
                  showNotificationSettings={showNotificationSettings}
                  onToggleNotificationSettings={() => setShowNotificationSettings(!showNotificationSettings)}
                  notificationRule={newNotificationRule}
                  onNotificationRuleChange={setNewNotificationRule}
                  saving={saving}
                  commuteError={commuteError}
                  onSave={handleSaveCommute}
                  onCancel={() => {
                    if (editingCommuteId) {
                      lastInteractedCommuteIdRef.current = editingCommuteId;
                    }
                    resetRouteDraft();
                    setActiveView("saved");
                    setCommuteError(null);
                  }}
                  deletingCommuteId={deletingCommuteId}
                  onStartDelete={setDeletingCommuteId}
                  onConfirmDelete={(id) => {
                    handleDeleteCommute(id);
                    setDeletingCommuteId(null);
                    resetRouteDraft();
                    setActiveView("saved");
                  }}
                  onCancelDelete={() => setDeletingCommuteId(null)}
                  onOpenNotificationSettings={onOpenNotificationSettings}
                  notificationSummary={notificationSummary}
                  showRoutingDisclaimer={showRoutingDisclaimer}
                  onToggleRoutingDisclaimer={() => setShowRoutingDisclaimer((current) => !current)}
                />
              </div>
            ) : (
              <>
                <div className="my-stations-controls saved-commute-controls">
                  <div className="my-stations-controls-top">
                    <label className="impact-list-search my-stations-search saved-commute-search">
                      <Search size={15} aria-hidden="true" />
                      <span className="sr-only">Search saved commutes</span>
                      <input
                        type="search"
                        className="submenu-search-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search saved commutes..."
                      />
                    </label>
                    <button
                      type="button"
                      className="my-stations-mode-action my-stations-add my-commutes-add saved-commute-add-btn"
                      onClick={startCreatingCommute}
                      aria-label="+ Add Commute"
                    >
                      <span className="my-stations-mode-action-content">
                        <Plus size={16} aria-hidden="true" />
                        <span className="my-stations-add-wide">Add Commute</span>
                        <span className="my-stations-add-compact">Add</span>
                      </span>
                    </button>
                  </div>
                  <div
                    className="account-network-filter w-full"
                    data-network={networkFilter}
                    data-options-count={ACCOUNT_NETWORK_OPTIONS.length}
                    role="group"
                    aria-label="Filter My Commutes by network"
                  >
                    <div className="account-network-glider" aria-hidden="true" />
                    {ACCOUNT_NETWORK_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-network={option.value}
                        aria-pressed={networkFilter === option.value}
                        onClick={() => setNetworkFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="my-stations-selects saved-commute-selects">
                    <ToolbarSelectMenu
                      ariaLabel="Sort My Commutes"
                      prefix="Sort"
                      value={sortBy}
                      options={COMMUTE_SORT_OPTIONS}
                      onChange={setSortBy}
                      align="left"
                    />
                    {visibleCommutes.length > 0 ? (
                      <div className="flex items-center gap-1.5 ml-auto shrink-0" data-testid="commute-status-badges">
                        <span className="toolbar-status-badge toolbar-status-badge--total">
                          {visibleCommutes.length} Total
                        </span>
                        {commuteClearCount > 0 ? (
                          <span className="toolbar-status-badge toolbar-status-badge--clear">
                            {commuteClearCount} Clear
                          </span>
                        ) : null}
                        {commuteAffectedCount > 0 ? (
                          <span className="toolbar-status-badge toolbar-status-badge--affected">
                            {commuteAffectedCount} Affected
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  className="commute-grid saved-commute-list-scroll min-w-0 pb-3 flex flex-col gap-3"
                  aria-label="Saved commutes"
                >
                  {visibleCommutes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center pt-3 pb-10 sm:py-10 text-center">
                      <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-4">
                        {accountCommutes.length === 0
                          ? "No Commutes Yet"
                          : query.trim()
                            ? "No Commutes Match"
                            : "No Commutes Match This Network"}
                      </p>
                      {query.trim() ? (
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          onClick={() => setQuery("")}
                        >
                          Clear Search
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="saved-commute-add-btn flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                          onClick={startCreatingCommute}
                        >
                          Create Commute
                        </button>
                      )}
                    </div>
                  ) : (
                    sortedCommutes.map((commute) => (
                      <SavedCommuteCard
                        key={commute.id}
                        commute={commute}
                        selectedLegId={selectedLegIds[commute.id] ?? "outbound"}
                        onToggleLeg={handleToggleLeg}
                        isUserToggled={(userToggledCommuteIds[commute.id] ?? 0) > 0}
                        toggleCount={userToggledCommuteIds[commute.id] ?? 0}
                        onClearSwapAnimation={clearCommuteSwapAnimation}
                        stationNameFor={stationNameFor}
                        viewedCommuteId={viewedCommuteId}
                        onViewPath={(com, legId) => {
                          lastInteractedCommuteIdRef.current = com.id;
                          setFocusedCommuteId(com.id);
                          onViewPath(com, legId);
                        }}
                        onViewImpactOnPath={handleViewImpactOnPath}
                        stopsExpanded={expandedCommuteId === commute.id}
                        onToggleStops={(id) => setExpandedCommuteId((current) => (current === id ? null : id))}
                        isDisclosureOpen={
                          expandedImpactDisclosures[`${commute.id}-${selectedLegIds[commute.id] ?? "outbound"}`] ??
                          persistedExpandedImpactDisclosures.has(
                            `${commute.id}-${selectedLegIds[commute.id] ?? "outbound"}`,
                          )
                        }
                        onToggleDisclosure={handleToggleImpactDisclosure}
                        notificationDraft={notificationDrafts[commute.id]}
                        onNotificationDraftChange={updateNotificationDraft}
                        isEditingNotificationRule={editingNotificationCommuteId === commute.id}
                        onStartEditingNotificationRule={startEditingNotificationRule}
                        onCloseEditingNotificationRule={() => {
                          setEditingNotificationCommuteId(null);
                          setNotificationRuleError(null);
                        }}
                        onSaveNotificationRule={saveNotificationRule}
                        isSavingNotificationRule={savingNotificationRuleId === commute.id}
                        notificationRuleError={notificationRuleError}
                        onStartEditingRoute={startEditingCommute}
                      />
                    ))
                  )}
                  <p className="saved-commute-routing-boundary-static" role="note">
                    <Info size={11} aria-hidden="true" />
                    <span>Monitoring the rail routes you selected. They may not be the fastest or most optimal routes in every scenario.</span>
                  </p>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
      {successMessage && (
        <div key={toastKey} className="commute-toast-success text-white">
          <Check size={16} className="text-white" />
          <span className="text-white">{successMessage}</span>
        </div>
      )}
    </section>
  );
}

export {
  type SavedCommuteDraft,
  persistedCommuteDraftStore,
  clearPersistedCommuteDraft,
  setPersistedCommuteDraft,
  persistedExpandedImpactDisclosures,
} from "../app/commute-draft-state.ts";

export {
  TravelTimeEstimateBlock,
  travelTimeSeverity,
} from "./SavedCommuteCard";

export { SavedCommuteNotificationRuleEditor } from "./SavedCommuteNotificationRuleEditor";
export { SavedCommuteRouteDraftEditor } from "./SavedCommuteRouteDraftEditor";
export {
  SavedCommuteNotificationSummary,
  MonitoredRoutesDisclaimer,
} from "./SavedCommuteNotificationSummary";
