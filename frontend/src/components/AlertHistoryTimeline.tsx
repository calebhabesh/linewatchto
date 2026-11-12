"use client";

import { FilterSearchRow, FilterResultCount } from "./FilterSearchRow";

import { availableFilterOptions } from "../app/filter-options";

import { FilterOptionCount } from "./FilterOptionCount";

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Construction,
  History,
  Layers,
  Loader2,
  MapPin,
  Search,
  Train,
  Wrench,
} from "lucide-react";
import {
  getAlertHistory,
  type AlertHistoryIncident,
  type AlertHistoryPeriod,
} from "../app/alert-history-data";
import { formatAlertHistoryDuration } from "../app/alert-history-time";
import type { ImpactKind } from "../app/linewatch-data";
import { findNotifiedHistoryIncident, type NotificationTapNotice as TapNoticeValue } from "../app/notification-target";
import { NotificationTapNotice } from "./NotificationTapNotice";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { formatFullImpactTimestamp, formatImpactTimestamp } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { CompactImpactLocation, ImpactCardMapButton, formatCause } from "./ImpactCardFields";
import { alertHistoryPreviewId, type AlertHistoryMapTarget } from "../app/alert-history-map-target";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import { DropdownMenuPortal } from "./DropdownMenuPortal";
import {
  ALL_LINES_VALUE,
  ALL_TYPES_VALUE,
  MOST_RECENT_SORT_VALUE,
  SORT_ACTIVE_FIRST,
  SORT_ALERT_TYPE,
  SORT_CAUSE_AZ,
  SORT_CLEARED_FIRST,
  SORT_LEAST_UPDATES,
  SORT_LINE,
  SORT_LOCATION_AZ,
  SORT_LOCATION_ZA,
  SORT_LONGEST_DURATION,
  SORT_MOST_RECENT,
  SORT_MOST_UPDATES,
  SORT_OLDEST,
  SORT_SHORTEST_DURATION,
  buildAlertHistoryLineOptions,
  buildAlertHistorySearchIndex,
  buildAlertHistorySortGroups,
  buildAlertHistorySortOptions,
  buildAlertHistoryTypeOptions,
  filterAndSortAlertHistory,
  formatAlertTypeName,
  normalizeEventTypeKey,
  type AlertHistoryStatusFilter,
  type AlertHistoryViewItem,
} from "./alert-history-filters";

import { affectedStationLabel, historyCategory, historyCause, historyChangedFields, historyDescription, historyEventsNewestFirst } from "./alert-history-details";

const HISTORY_PAGE_SIZE = 50;
const COLLAPSED_LIFECYCLE_THRESHOLD = 4;

const PERIODS: Array<{ value: AlertHistoryPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const FILTERS: Array<{ value: AlertHistoryStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "cleared", label: "Cleared" },
];

function renderTypeOptionIcon(value: string) {
  if (value === ALL_TYPES_VALUE) {
    return <Layers size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  const key = normalizeEventTypeKey(value);
  if (key === "suspension") {
    return <AlertTriangle size={13} className="text-red-500 shrink-0" aria-hidden="true" />;
  }
  if (key === "delay") {
    return <DelayIcon size={13} className="text-amber-500 dark:text-amber-400 shrink-0" aria-hidden="true" />;
  }
  if (key === "reduced-speed-zone") {
    return <Construction size={13} className="rsz-tone shrink-0" aria-hidden="true" />;
  }
  if (key === "planned-closure") {
    return <PlannedClosureIcon size={13} className="text-blue-500 dark:text-blue-400 shrink-0" aria-hidden="true" />;
  }
  return <AlertTriangle size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
}

function renderSortOptionIcon(value: string) {
  if (value === SORT_MOST_RECENT || value === MOST_RECENT_SORT_VALUE) {
    return <Clock3 size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_OLDEST) {
    return <History size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_LONGEST_DURATION) {
    return <ArrowDownWideNarrow size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_SHORTEST_DURATION) {
    return <ArrowUpNarrowWide size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_ALERT_TYPE) {
    return <AlertTriangle size={13} className="text-amber-500 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_LINE) {
    return <Train size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_LOCATION_AZ || value === SORT_LOCATION_ZA) {
    return <MapPin size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_CAUSE_AZ) {
    return <Wrench size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_MOST_UPDATES || value === SORT_LEAST_UPDATES) {
    return <Activity size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_ACTIVE_FIRST) {
    return <AlertTriangle size={13} className="text-red-500 shrink-0" aria-hidden="true" />;
  }
  if (value === SORT_CLEARED_FIRST) {
    return <Check size={13} className="text-emerald-500 shrink-0" aria-hidden="true" />;
  }

  const key = normalizeEventTypeKey(value);
  if (key === "suspension") {
    return <AlertTriangle size={13} className="text-red-500 shrink-0" aria-hidden="true" />;
  }
  if (key === "delay") {
    return <DelayIcon size={13} className="text-amber-500 dark:text-amber-400 shrink-0" aria-hidden="true" />;
  }
  if (key === "reduced-speed-zone") {
    return <Construction size={13} className="rsz-tone shrink-0" aria-hidden="true" />;
  }
  if (key === "planned-closure") {
    return <PlannedClosureIcon size={13} className="text-blue-500 dark:text-blue-400 shrink-0" aria-hidden="true" />;
  }
  return <AlertTriangle size={13} className="text-slate-400 shrink-0" aria-hidden="true" />;
}

export type AlertHistoryFocus = {
  alertId: string;
  lineId: string | null;
  impactKind: ImpactKind;
  notice: TapNoticeValue;
};

/** View on each card: where the alert is (still listed) or was (drawn from history). */
export type AlertHistoryMapProps = {
  resolveMapTarget?: (incident: AlertHistoryIncident) => AlertHistoryMapTarget | null;
  onViewMapTarget?: (target: AlertHistoryMapTarget) => void;
  /** The past alert drawn on the map now (its preview id); its card's View reads Back. */
  viewedPreviewId?: string | null;
  /** Back: takes the drawn past alert off the map. */
  onClearMapTarget?: () => void;
};

/**
 * The list as it was when last left (filters, pages shown, loaded incidents,
 * scroll), so returning to it (Back from a card's View, or from a live alert's
 * card) opens where the rider was. Kept for this page session only.
 */
type SavedHistoryView = {
  network: NetworkId;
  period: AlertHistoryPeriod;
  filter: AlertHistoryStatusFilter;
  searchQuery: string;
  selectedLineId: string;
  selectedTypeId: string;
  selectedSortBy: string;
  pagination: { key: string; visibleCount: number };
  history: AlertHistoryIncident[];
  historyWindow: { since: string; until: string };
  loadedQuery: string | null;
  /** The card at the top of the list and how far it sat above the list's top edge. */
  scrollAnchor: { key: string; offset: number } | null;
};
let savedHistoryView: SavedHistoryView | null = null;

export function AlertHistoryTimeline({
  network,
  destination = null,
  restoreView = false,
  resolveMapTarget,
  onViewMapTarget,
  viewedPreviewId = null,
  onClearMapTarget,
}: {
  network: NetworkId;
  /** Set when a notification tap landed here because its alert is no longer current. */
  destination?: AlertHistoryFocus | null;
  /** Reopen the list as it was left (navigating back to it); a fresh open starts at the top. */
  restoreView?: boolean;
} & AlertHistoryMapProps) {
  const [restored] = useState(() => (
    restoreView && !destination && savedHistoryView?.network === network ? savedHistoryView : null
  ));
  const [period, setPeriod] = useState<AlertHistoryPeriod>(restored?.period ?? "today");
  const [filter, setFilter] = useState<AlertHistoryStatusFilter>(restored?.filter ?? "all");
  const [searchQuery, setSearchQuery] = useState(restored?.searchQuery ?? "");
  const [selectedLineId, setSelectedLineId] = useState(restored?.selectedLineId ?? destination?.lineId ?? ALL_LINES_VALUE);
  const [selectedTypeId, setSelectedTypeId] = useState(restored?.selectedTypeId ?? ALL_TYPES_VALUE);
  const [tapNoticeDismissed, setTapNoticeDismissed] = useState(false);
  const [focusSearch, setFocusSearch] = useState<"searching" | "widened" | "settled">(destination ? "searching" : "settled");
  const [selectedSortBy, setSelectedSortBy] = useState(restored?.selectedSortBy ?? MOST_RECENT_SORT_VALUE);
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [history, setHistory] = useState<AlertHistoryIncident[]>(restored?.history ?? []);
  const [historyWindow, setHistoryWindow] = useState(restored?.historyWindow ?? { since: "", until: "" });
  const [pagination, setPagination] = useState(restored?.pagination ?? { key: "", visibleCount: HISTORY_PAGE_SIZE });
  const [loadedQuery, setLoadedQuery] = useState<string | null>(restored?.loadedQuery ?? null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef(restored?.scrollAnchor ?? null);
  const anchorFrameRef = useRef<number | null>(null);
  // Remember the list as it is, for when the rider comes back to it.
  const viewSnapshot: SavedHistoryView = {
    network, period, filter, searchQuery, selectedLineId, selectedTypeId, selectedSortBy,
    pagination, history, historyWindow, loadedQuery, scrollAnchor: null,
  };
  const viewSnapshotRef = useRef(viewSnapshot);
  useLayoutEffect(() => {
    viewSnapshotRef.current = viewSnapshot;
  });
  useEffect(() => () => {
    if (anchorFrameRef.current !== null) window.cancelAnimationFrame(anchorFrameRef.current);
    savedHistoryView = { ...viewSnapshotRef.current, scrollAnchor: scrollAnchorRef.current };
  }, []);
  // Cards render at a placeholder height until near the viewport
  // (content-visibility), so a saved scrollTop would land on another card:
  // bring the saved top card back to where it was instead.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const anchor = restored?.scrollAnchor;
    if (!container || !anchor) return;
    const placeAnchor = () => {
      const row = container.querySelector<HTMLElement>(`[data-history-key="${CSS.escape(anchor.key)}"]`);
      if (!row) return;
      const drift = row.getBoundingClientRect().top - container.getBoundingClientRect().top + anchor.offset;
      if (Math.abs(drift) >= 1) container.scrollTop += drift;
    };
    placeAnchor();
    // Cards near the anchor take their real height over the next frames; hold
    // the anchor until they settle, unless the rider takes over first.
    let frames = 0;
    let frame = window.requestAnimationFrame(function settle() {
      placeAnchor();
      frames += 1;
      if (frames < 20) frame = window.requestAnimationFrame(settle);
    });
    const stop = () => window.cancelAnimationFrame(frame);
    const interactions = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    interactions.forEach((type) => container.addEventListener(type, stop, { passive: true, once: true }));
    return () => {
      stop();
      interactions.forEach((type) => container.removeEventListener(type, stop));
    };
  }, [restored]);
  const recordScrollAnchor = useCallback(() => {
    anchorFrameRef.current = null;
    const container = scrollContainerRef.current;
    // A list being hidden (leaving for the map) has no top card; keep the last one.
    if (!container || container.clientHeight === 0) return;
    if (container.scrollTop === 0) {
      scrollAnchorRef.current = null;
      return;
    }
    const top = container.getBoundingClientRect().top;
    const row = [...container.querySelectorAll<HTMLElement>("[data-history-key]")]
      .find((candidate) => candidate.getBoundingClientRect().bottom > top);
    scrollAnchorRef.current = row?.dataset.historyKey
      ? { key: row.dataset.historyKey, offset: top - row.getBoundingClientRect().top }
      : null;
  }, []);

  const requestedQuery = `${network}:${period}`;

  useEffect(() => {
    let cancelled = false;
    getAlertHistory(period, network).then((result) => {
      if (cancelled) return;
      setHistory(result.data.incidents);
      setHistoryWindow({ since: result.data.since, until: result.data.until });
      setLoadedQuery(requestedQuery);
    });
    return () => {
      cancelled = true;
    };
  }, [network, period, requestedQuery]);

  const loading = loadedQuery !== requestedQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchIndex = useMemo(() => buildAlertHistorySearchIndex(history), [history]);

  const lineOptions = useMemo(() => buildAlertHistoryLineOptions(history).map((option) => (
    network === "regional" && option.value === ALL_LINES_VALUE
      ? { ...option, label: "All Corridors" }
      : option
  )), [history, network]);
  const typeOptions = useMemo(() => buildAlertHistoryTypeOptions(history), [history]);
  const sortGroups = useMemo(() => buildAlertHistorySortGroups(), []);
  const sortOptions = useMemo(() => buildAlertHistorySortOptions(history), [history]);

  const focusIncident = useMemo(
    () => (destination && !loading ? findNotifiedHistoryIncident(history, destination.alertId) : null),
    [history, destination, loading],
  );
  const focusTypeId = destination ? normalizeEventTypeKey(destination.impactKind) : ALL_TYPES_VALUE;
  if (destination && !loading && focusSearch !== "settled" && !focusIncident) {
    // Ended alerts usually started today; widen once before falling back to the line and type.
    if (focusSearch === "searching" && period === "today") {
      setFocusSearch("widened");
      setPeriod("7d");
    } else {
      setFocusSearch("settled");
      if (typeOptions.some((option) => option.value === focusTypeId)) setSelectedTypeId(focusTypeId);
    }
  } else if (focusSearch !== "settled" && focusIncident) {
    setFocusSearch("settled");
  }
  const focusLineLabel = destination?.lineId
    ? lineOptions.find((option) => option.value === destination.lineId)?.label ?? null
    : null;
  const focusDetail = !destination || loading || focusSearch !== "settled"
    ? null
    : focusIncident
      ? "Its record is highlighted below."
      : focusLineLabel
        ? `Showing recent ${focusLineLabel} history.`
        : "Its record isn't in recent history yet.";

  // Options are empty while loading; resetting then would discard a notification's line filter.
  if (!loading && selectedLineId !== ALL_LINES_VALUE && !lineOptions.some((option) => option.value === selectedLineId)) {
    setSelectedLineId(ALL_LINES_VALUE);
  }

  if (!loading && selectedTypeId !== ALL_TYPES_VALUE && !typeOptions.some((option) => option.value === selectedTypeId)) {
    setSelectedTypeId(ALL_TYPES_VALUE);
  }

  const visibleItems = useMemo(() => filterAndSortAlertHistory(history, {
    statusFilter: filter,
    lineId: selectedLineId,
    typeId: selectedTypeId,
    searchQuery: deferredSearchQuery,
    sortBy: selectedSortBy,
    since: historyWindow.since,
    until: historyWindow.until,
  }, searchIndex), [deferredSearchQuery, filter, history, historyWindow, searchIndex, selectedLineId, selectedTypeId, selectedSortBy]);

  const countHistoryOption = (lineId: string, typeId: string) => loading ? undefined : filterAndSortAlertHistory(history, {
    statusFilter: filter,
    lineId,
    typeId,
    searchQuery: deferredSearchQuery,
    sortBy: selectedSortBy,
    since: historyWindow.since,
    until: historyWindow.until,
  }, searchIndex).length;

  const statusOptions = FILTERS.map(option => ({ ...option, count: loading ? undefined : filterAndSortAlertHistory(history, {
    statusFilter: option.value, lineId: selectedLineId, typeId: selectedTypeId,
    searchQuery: deferredSearchQuery, sortBy: selectedSortBy, since: historyWindow.since, until: historyWindow.until,
  }, searchIndex).length }));

  const resultSetKey = [
    network,
    period,
    filter,
    selectedLineId,
    selectedTypeId,
    selectedSortBy,
    deferredSearchQuery,
  ].join(":");
  const visibleCount = pagination.key === resultSetKey
    ? pagination.visibleCount
    : HISTORY_PAGE_SIZE;

  const focusIncidentKey = focusIncident ? historyIncidentKey(focusIncident) : null;
  const focusIndex = focusIncidentKey
    ? visibleItems.findIndex((item) => historyIncidentKey(item.incident) === focusIncidentKey)
    : -1;
  // Page far enough to include the notified incident rather than hiding it behind "Show more".
  const effectiveVisibleCount = focusIndex >= visibleCount
    ? Math.ceil((focusIndex + 1) / HISTORY_PAGE_SIZE) * HISTORY_PAGE_SIZE
    : visibleCount;
  const displayedItems = useMemo(
    () => visibleItems.slice(0, effectiveVisibleCount),
    [effectiveVisibleCount, visibleItems],
  );
  // Which cards can show a map location; recomputed as the live data changes.
  const viewableKeys = useMemo(() => {
    if (!resolveMapTarget) return null;
    const keys = new Set<string>();
    for (const item of displayedItems) {
      if (resolveMapTarget(item.incident)) keys.add(historyIncidentKey(item.incident));
    }
    return keys;
  }, [displayedItems, resolveMapTarget]);
  const mapActionsRef = useRef({ resolveMapTarget, onViewMapTarget, onClearMapTarget });
  useLayoutEffect(() => {
    mapActionsRef.current = { resolveMapTarget, onViewMapTarget, onClearMapTarget };
  });
  const clearView = useCallback(() => mapActionsRef.current.onClearMapTarget?.(), []);
  const viewIncident = useCallback((incident: AlertHistoryIncident) => {
    const { resolveMapTarget: resolve, onViewMapTarget: view } = mapActionsRef.current;
    const target = resolve?.(incident);
    if (target) view?.(target);
  }, []);

  const selectedLineOption = useMemo(() => {
    return lineOptions.find((o) => o.value === selectedLineId);
  }, [lineOptions, selectedLineId]);

  const selectedTypeOption = useMemo(() => {
    return typeOptions.find((o) => o.value === selectedTypeId) ?? typeOptions[0];
  }, [typeOptions, selectedTypeId]);

  const selectedSortOption = useMemo(() => {
    return sortOptions.find((o) => o.value === selectedSortBy) ?? sortOptions[0];
  }, [sortOptions, selectedSortBy]);

  // A new result set starts at the top; the first one keeps a restored position.
  const shownResultSetKeyRef = useRef(resultSetKey);
  useEffect(() => {
    if (shownResultSetKeyRef.current === resultSetKey) return;
    shownResultSetKeyRef.current = resultSetKey;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [resultSetKey]);

  const scrolledFocusKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusIncidentKey || focusIndex < 0 || scrolledFocusKeyRef.current === focusIncidentKey) return;
    const row = scrollContainerRef.current?.querySelector<HTMLElement>(
      `[data-history-key="${CSS.escape(focusIncidentKey)}"]`,
    );
    if (!row) return;
    scrolledFocusKeyRef.current = focusIncidentKey;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [displayedItems, focusIncidentKey, focusIndex]);

  return (
    <section className="alert-history-timeline" aria-label="Alert history timeline">
      {destination && !tapNoticeDismissed ? (
        <NotificationTapNotice
          notice={destination.notice}
          detail={focusDetail}
          onDismiss={() => setTapNoticeDismissed(true)}
        />
      ) : null}
      <div className="alert-history-controls" aria-label="Alert history filters">
        <div className="alert-history-chip-group" aria-label="History period">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-period-chip ${period === option.value ? "active" : ""}`}
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="alert-history-divider" aria-hidden="true" />
        <div className="alert-history-chip-group" aria-label="Incident status">
          {availableFilterOptions(statusOptions, filter).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-filter-chip ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}<FilterOptionCount count={option.count} />
            </button>
          ))}
        </div>
        <div className="alert-history-search-row" aria-label="Alert history search and line selector">
          <FilterSearchRow active={Boolean(searchQuery || selectedLineId !== ALL_LINES_VALUE || selectedTypeId !== ALL_TYPES_VALUE || filter !== "all")} onReset={() => {
            setSearchQuery(""); setSelectedLineId(ALL_LINES_VALUE); setSelectedTypeId(ALL_TYPES_VALUE); setFilter("all");
          }}>
          <label className="alert-history-search-field">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              className="submenu-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search history"
              aria-label="Search alert history"
            />
          </label>
          </FilterSearchRow>
          <div className="alert-history-selects-row">
            {/* Line / Corridor Selector */}
            <div className="alert-history-line-filter relative" ref={lineDropdownRef}>
              <span className="alert-history-control-prefix">{network === "regional" ? "Corr" : "Line"}</span>
              <button
                type="button"
                className="alert-history-line-filter-trigger"
                onClick={() => {
                  setIsLineDropdownOpen((prev) => !prev);
                  setIsTypeDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                }}
                aria-label="Transit line"
                aria-expanded={isLineDropdownOpen}
              >
                {selectedLineOption?.lineNumber && selectedLineOption?.lineId ? (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TransitLineBadge lineId={selectedLineOption.lineId} lineNumber={selectedLineOption.lineNumber} size={20} className="shrink-0" />
                    {selectedLineOption.lineName && <span className="truncate">{selectedLineOption.lineName}</span>}
                  </span>
                ) : (
                  <span className="truncate">{selectedLineOption?.label ?? (network === "regional" ? "All Corridors" : "All Lines")}</span>
                )}
                <FilterOptionCount count={countHistoryOption(selectedLineId, selectedTypeId)} />
                <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
              </button>
              <DropdownMenuPortal
                open={isLineDropdownOpen}
                onClose={() => setIsLineDropdownOpen(false)}
                triggerRef={lineDropdownRef}
                align="left"
                as="ul"
                className="alert-history-line-filter-options"
              >
                {availableFilterOptions(lineOptions.map(option => ({ ...option, count: countHistoryOption(option.value, selectedTypeId) })), selectedLineId, ALL_LINES_VALUE).map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={`alert-history-line-filter-option ${selectedLineId === option.value ? "selected" : ""}`}
                      onClick={() => {
                        if (selectedLineId === option.value) {
                          setSelectedLineId(ALL_LINES_VALUE);
                        } else {
                          setSelectedLineId(option.value);
                        }
                        setIsLineDropdownOpen(false);
                      }}
                    >
                      {option.lineNumber && option.lineId ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <TransitLineBadge lineId={option.lineId} lineNumber={option.lineNumber} size={22} className="shrink-0" />
                          {option.lineName && <span className="truncate">{option.lineName}</span>}
                        </span>
                      ) : (
                        <span className="truncate">{option.label}</span>
                      )}
                      <FilterOptionCount count={countHistoryOption(option.value, selectedTypeId)} />
                    </button>
                  </li>
                ))}
              </DropdownMenuPortal>
            </div>

            {/* Alert Type Selector */}
            <div className="alert-history-line-filter relative" ref={typeDropdownRef}>
              <span className="alert-history-control-prefix">Type</span>
              <button
                type="button"
                className="alert-history-line-filter-trigger"
                onClick={() => {
                  setIsTypeDropdownOpen((prev) => !prev);
                  setIsLineDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                }}
                aria-label="Alert type"
                aria-expanded={isTypeDropdownOpen}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {renderTypeOptionIcon(selectedTypeOption.value)}
                  <span className="truncate">{selectedTypeOption.label}</span>
                </span>
                <FilterOptionCount count={countHistoryOption(selectedLineId, selectedTypeId)} />
                <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
              </button>
              <DropdownMenuPortal
                open={isTypeDropdownOpen}
                onClose={() => setIsTypeDropdownOpen(false)}
                triggerRef={typeDropdownRef}
                align="left"
                as="ul"
                className="alert-history-line-filter-options"
              >
                {availableFilterOptions(typeOptions.map(option => ({ ...option, count: countHistoryOption(selectedLineId, option.value) })), selectedTypeId, ALL_TYPES_VALUE).map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={`alert-history-line-filter-option ${selectedTypeId === option.value ? "selected" : ""}`}
                      onClick={() => {
                        if (selectedTypeId === option.value) {
                          setSelectedTypeId(ALL_TYPES_VALUE);
                        } else {
                          setSelectedTypeId(option.value);
                        }
                        setIsTypeDropdownOpen(false);
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {renderTypeOptionIcon(option.value)}
                        <span className="truncate">{option.label}</span>
                      </span>
                      <FilterOptionCount count={countHistoryOption(selectedLineId, option.value)} />
                    </button>
                  </li>
                ))}
              </DropdownMenuPortal>
            </div>

            {/* Sort Selector */}
            <div className="alert-history-line-filter relative" ref={sortDropdownRef}>
              <span className="alert-history-control-prefix">Sort</span>
              <button
                type="button"
                className="alert-history-line-filter-trigger"
                onClick={() => {
                  setIsSortDropdownOpen((prev) => !prev);
                  setIsLineDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                }}
                aria-label="Sort alert history"
                aria-expanded={isSortDropdownOpen}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {renderSortOptionIcon(selectedSortOption.value)}
                  <span className="truncate">{selectedSortOption.label}</span>
                </span>
                <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
              </button>
              <DropdownMenuPortal
                open={isSortDropdownOpen}
                onClose={() => setIsSortDropdownOpen(false)}
                triggerRef={sortDropdownRef}
                align="right"
                as="div"
                className="alert-history-line-filter-options align-right"
                maxWidth={320}
              >
                {sortGroups.map((group, groupIdx) => (
                  <div key={group.id} className="alert-history-sort-group">
                    {groupIdx > 0 && <div className="alert-history-sort-group-divider" aria-hidden="true" />}
                    <div className="alert-history-sort-group-header">{group.label}</div>
                    <ul className="alert-history-sort-group-list">
                      {group.options.map((option) => (
                        <li key={option.value}>
                          <button
                            type="button"
                            className={`alert-history-line-filter-option ${selectedSortBy === option.value ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedSortBy(option.value);
                              setIsSortDropdownOpen(false);
                            }}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              {renderSortOptionIcon(option.value)}
                              <span className="truncate">{option.label}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </DropdownMenuPortal>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="alert-history-scroll"
        aria-label="Alert history incidents"
        onScroll={() => {
          if (anchorFrameRef.current === null) anchorFrameRef.current = window.requestAnimationFrame(recordScrollAnchor);
        }}
      >
        {loading ? (
          <p className="notification-settings-message alert-history-loading" role="status">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Loading alert history...
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="notification-settings-note alert-history-empty">
            No alert incidents match the selected filters.
          </p>
        ) : (
          <>
            <FilterResultCount shown={displayedItems.length} total={visibleItems.length} noun="incidents" />
            <ol className="alert-history-list" aria-busy={searchQuery !== deferredSearchQuery}>
              {displayedItems.map((item) => (
                <HistoryIncident
                  key={historyIncidentKey(item.incident)}
                  incident={item.incident}
                  latestEvent={item.latestEvent}
                  cleared={item.cleared}
                  highlighted={historyIncidentKey(item.incident) === focusIncidentKey}
                  mapAction={viewableKeys
                    ? viewableKeys.has(historyIncidentKey(item.incident)) ? "available" : "unavailable"
                    : null}
                  viewing={viewedPreviewId !== null && viewedPreviewId === alertHistoryPreviewId(item.incident)}
                  onView={viewIncident}
                  onClearView={clearView}
                />
              ))}
            </ol>
            {displayedItems.length < visibleItems.length ? (
              <button
                type="button"
                className="alert-history-load-more"
                onClick={() => setPagination((current) => ({
                  key: resultSetKey,
                  visibleCount:
                    (current.key === resultSetKey ? current.visibleCount : HISTORY_PAGE_SIZE) + HISTORY_PAGE_SIZE,
                }))}
              >
                Show {Math.min(HISTORY_PAGE_SIZE, visibleItems.length - displayedItems.length)} more
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

const HistoryIncident = memo(function HistoryIncident({
  incident,
  latestEvent,
  cleared,
  highlighted = false,
  mapAction = null,
  viewing = false,
  onView,
  onClearView,
}: AlertHistoryViewItem & {
  highlighted?: boolean;
  /** Whether View can show this alert on the map; no button without a map. */
  mapAction?: "available" | "unavailable" | null;
  /** This card's past location is drawn on the map now: View reads Back and takes it off. */
  viewing?: boolean;
  onView?: (incident: AlertHistoryIncident) => void;
  onClearView?: () => void;
}) {
  const [lifecycleExpanded, setLifecycleExpanded] = useState(
    incident.events.length <= COLLAPSED_LIFECYCLE_THRESHOLD,
  );
  const time = latestEvent.happenedAt ?? incident.latestEventAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  const title = compactHistoryTitle(incident);
  const description = historyDescription(latestEvent);
  const cause = historyCause(incident.cause);
  const category = historyCategory(incident);
  const events = historyEventsNewestFirst(incident.events);
  const latestState = historyLifecycleTone(incident.latestState || latestEvent.state);
  const statusLabel = formatHistoryStateLabel(latestState);
  const facts = [
    incident.displayDirection ? { label: "Direction", value: incident.displayDirection } : null,
    cause ? { label: "Cause", value: formatCause(cause) } : null,
    !cause && category ? { label: "Source Category", value: category } : null,
    incident.source ? { label: "Source", value: normalizeDashboardSourceLabel(incident.source) } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));

  return (
    <li
      className={`alert-history-item ${
        cleared
          ? "alert-history-event-cleared"
          : `alert-history-event-suspension-history-tone-${historyAlertTypeTone(incident.eventType)}`
      } transition-all${viewing ? " is-active" : ""}${highlighted ? " notification-target-highlight" : ""}`}
      data-history-key={historyIncidentKey(incident)}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="alert-history-content">
        <div className="alert-history-card-heading">
          <div
            className="alert-history-heading-top"
            style={{ alignItems: "center", display: "flex", flexDirection: "row", flexWrap: "nowrap", justifyContent: "space-between", width: "100%" }}
          >
            <HistoryLineIdentity incident={incident} />
            {time ? <HistoryTimestamp timestamp={time} primary /> : null}
          </div>
          <div className="alert-history-heading-badges">
            <HistoryAlertType eventType={incident.eventType} />
            <span className={`alert-history-status-label alert-history-status-${latestState}`}>
              {latestState === "cleared" ? (
                <Check size={12} aria-hidden="true" />
              ) : latestState === "updated" ? (
                <Activity size={13} aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} aria-hidden="true" />
              )}
              {statusLabel}
            </span>
            {mapAction ? (
              <ImpactCardMapButton
                className="alert-history-map-btn"
                title={`${lineLabel(incident)} ${formatAlertTypeName(incident.eventType.trim().toLowerCase())}${incident.location ? `, ${incident.location}` : ""}`}
                disabled={mapAction === "unavailable"}
                onClick={() => (viewing ? onClearView?.() : onView?.(incident))}
                actionLabel={viewing ? "Back" : undefined}
                backLabel="Hide from Map"
              />
            ) : null}
          </div>
        </div>
        <strong className="alert-history-title">{title}</strong>
        {description ? <p className="alert-history-description">{description}</p> : null}
        <div className="alert-history-fact-grid" aria-label="Alert summary">
          {incident.location ? (
            <span className="alert-history-fact alert-history-fact-location">
              <span>{affectedStationLabel(incident.location)}</span>
              <strong><CompactImpactLocation location={incident.location} direction={incident.displayDirection} /></strong>
            </span>
          ) : null}
          {facts.map((fact) => (
            <span className="alert-history-fact" key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </span>
          ))}
          {cleared && incident.durationMinutes !== null ? (
            <span className="alert-history-fact alert-history-duration">
              <span>Duration</span>
              <strong>
                <Clock3 size={13} aria-hidden="true" />
                {formatAlertHistoryDuration(incident.durationMinutes)}
              </strong>
            </span>
          ) : null}
        </div>
        <details
          className="alert-history-details"
          open={lifecycleExpanded}
          onToggle={(event) => setLifecycleExpanded(event.currentTarget.open)}
        >
          <summary>
            <span className="alert-history-details-heading">
              <ClipboardList size={13} aria-hidden="true" />
              Lifecycle Details
            </span>
            <span className="alert-history-details-count">
              {incident.events.length} {incident.events.length === 1 ? "event" : "events"}
            </span>
            <ChevronDown className="alert-history-details-chevron" size={13} aria-hidden="true" />
          </summary>
          <ol data-multiple={events.length > 1 ? "true" : undefined}>
            {events.map((event, index) => {
              const tone = historyLifecycleTone(event.state);
              const nextEvent = events[index + 1];
              const nextTone = nextEvent ? historyLifecycleTone(nextEvent.state) : null;
              return (
                <li
                  key={event.id}
                  className={`alert-history-lifecycle-event alert-history-lifecycle-${tone}`}
                >
                  {nextTone ? (
                    <div
                      className={`alert-history-lifecycle-spine alert-history-spine-${nextTone}-to-${tone}`}
                      aria-hidden="true"
                    >
                      <div className="alert-history-spine-line" />
                    </div>
                  ) : null}
                  <span>{formatHistoryStatusLabel(event.label)}</span>
                  <HistoryTimestamp timestamp={event.happenedAt} />
                  <details className="alert-history-snapshot">
                    <summary>
                      Source details
                      {historyChangedFields(event, nextEvent).length > 0
                        ? ` · Changed: ${historyChangedFields(event, nextEvent).join(", ")}`
                        : ""}
                    </summary>
                    <strong>{event.title}</strong>
                    {historyDescription(event) ? <p className="alert-history-description">{historyDescription(event)}</p> : null}
                    {!event.description?.trim() ? <p>No description supplied in this snapshot.</p> : null}
                    <dl>
                      <dt>{affectedStationLabel(event.location)}</dt><dd>{event.location || "Not supplied"}</dd>
                      <dt>Direction</dt><dd>{event.displayDirection || "Not supplied"}</dd>
                      {historyCause(event.cause) ? <><dt>Cause</dt><dd>{formatCause(event.cause)}</dd></> : null}
                      <dt>Source</dt><dd>{normalizeDashboardSourceLabel(event.source)}</dd>
                    </dl>
                  </details>
                </li>
              );
            })}
          </ol>
        </details>
      </div>
    </li>
  );
});

function historyIncidentKey(incident: AlertHistoryIncident) {
  return incident.incidentId
    ?? `${incident.alertId}:occurrence:${incident.events.at(-1)?.id ?? "unknown"}`;
}

function historyLifecycleTone(state: string) {
  if (state === "cleared") return "cleared";
  if (state === "opened") return "opened";
  return "updated";
}

function formatHistoryStateLabel(state: string) {
  if (state === "cleared") return "Cleared";
  if (state === "updated") return "Updated";
  return "Opened";
}

function HistoryAlertType({ eventType }: { eventType: string }) {
  const normalizedType = eventType.trim().toLowerCase();
  const tone = historyAlertTypeTone(normalizedType);

  return (
    <span className={`alert-history-type-label alert-history-type-${tone}`}>
      {renderSortOptionIcon(normalizedType)}
      {formatAlertTypeName(normalizedType)}
    </span>
  );
}

function historyAlertTypeTone(eventType: string) {
  const key = normalizeEventTypeKey(eventType);
  if (["suspension", "delay", "reduced-speed-zone", "planned-closure"].includes(key)) {
    return key;
  }
  return "other";
}

function HistoryTimestamp({ timestamp, primary = false }: { timestamp: string; primary?: boolean }) {
  return (
    <time
      className={`impact-timestamp${primary ? " alert-history-primary-time" : ""}`}
      dateTime={timestamp}
      title={formatFullImpactTimestamp(timestamp)}
      suppressHydrationWarning
    >
      {primary ? <Clock3 size={13} aria-hidden="true" /> : null}
      {formatImpactTimestamp(timestamp)}
    </time>
  );
}

function HistoryLineIdentity({ incident }: { incident: AlertHistoryIncident }) {
  const hasLine = Boolean(incident.lineId && incident.lineNumber);
  return (
    <div
      className={`alert-history-line-identity${hasLine ? "" : " unknown"}`}
      style={{ alignItems: "center", display: "flex", flexDirection: "row", flexWrap: "nowrap" }}
    >
      {hasLine ? (
        <TransitLineBadge
          lineId={incident.lineId!}
          lineNumber={incident.lineNumber!}
          lineName={incident.lineName ?? undefined}
          size={24}
          className="alert-history-line-badge"
          decorative
        />
      ) : null}
      <span
        className={`alert-history-line-name min-w-0 truncate${hasLine ? "" : " unknown"}`}
        aria-label={lineLabel(incident)}
      >
        {hasLine ? incident.lineName ?? `Line ${incident.lineNumber}` : "Line Unavailable"}
      </span>
    </div>
  );
}

function lineLabel(incident: AlertHistoryIncident) {
  if (!incident.lineNumber) return "Line Unavailable";
  return incident.lineName
    ? `Line ${incident.lineNumber} ${incident.lineName}`
    : `Line ${incident.lineNumber}`;
}

function compactHistoryTitle(incident: AlertHistoryIncident) {
  const fullLineLabel = `${lineLabel(incident)}: `;
  if (incident.title.startsWith(fullLineLabel)) {
    return incident.title.slice(fullLineLabel.length);
  }
  return incident.title;
}

function formatHistoryStatusLabel(label: string | null | undefined) {
  if (!label) return "Active";
  return label
    .trim()
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (char) => char.toUpperCase());
}
