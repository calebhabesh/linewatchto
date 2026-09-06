"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { formatFullImpactTimestamp, formatImpactTimestamp } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { CompactImpactLocation, formatCause } from "./ImpactCardFields";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
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

import { historyCategory, historyCause, historyChangedFields, historyDescription, historyEventsNewestFirst } from "./alert-history-details";

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

export function AlertHistoryTimeline({ network }: { network: NetworkId }) {
  const [period, setPeriod] = useState<AlertHistoryPeriod>("today");
  const [filter, setFilter] = useState<AlertHistoryStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLineId, setSelectedLineId] = useState(ALL_LINES_VALUE);
  const [selectedTypeId, setSelectedTypeId] = useState(ALL_TYPES_VALUE);
  const [selectedSortBy, setSelectedSortBy] = useState(MOST_RECENT_SORT_VALUE);
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [history, setHistory] = useState<AlertHistoryIncident[]>([]);
  const [historyWindow, setHistoryWindow] = useState({ since: "", until: "" });
  const [pagination, setPagination] = useState({ key: "", visibleCount: HISTORY_PAGE_SIZE });
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(target)) {
        setIsLineDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(target)) {
        setIsTypeDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(target)) {
        setIsSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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

  if (selectedLineId !== ALL_LINES_VALUE && !lineOptions.some((option) => option.value === selectedLineId)) {
    setSelectedLineId(ALL_LINES_VALUE);
  }

  if (selectedTypeId !== ALL_TYPES_VALUE && !typeOptions.some((option) => option.value === selectedTypeId)) {
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

  const displayedItems = useMemo(
    () => visibleItems.slice(0, visibleCount),
    [visibleCount, visibleItems],
  );

  const selectedLineOption = useMemo(() => {
    return lineOptions.find((o) => o.value === selectedLineId);
  }, [lineOptions, selectedLineId]);

  const selectedTypeOption = useMemo(() => {
    return typeOptions.find((o) => o.value === selectedTypeId) ?? typeOptions[0];
  }, [typeOptions, selectedTypeId]);

  const selectedSortOption = useMemo(() => {
    return sortOptions.find((o) => o.value === selectedSortBy) ?? sortOptions[0];
  }, [sortOptions, selectedSortBy]);

  return (
    <section className="alert-history-timeline notification-settings-section" aria-label="Alert history timeline">
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
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-filter-chip ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="alert-history-search-row" aria-label="Alert history search and line selector">
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
                <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
              </button>
              {isLineDropdownOpen && (
                <ul className="alert-history-line-filter-options">
                  {lineOptions.map((option) => (
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
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
              </button>
              {isTypeDropdownOpen && (
                <ul className="alert-history-line-filter-options">
                  {typeOptions.map((option) => (
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
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
              {isSortDropdownOpen && (
                <div className="alert-history-line-filter-options align-right">
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
          <p className="alert-history-result-count" aria-live="polite">
            Showing <strong>{displayedItems.length}</strong> of <strong>{visibleItems.length}</strong> matching {visibleItems.length === 1 ? "incident" : "incidents"}
          </p>
          <ol className="alert-history-list" aria-busy={searchQuery !== deferredSearchQuery}>
            {displayedItems.map((item) => (
              <HistoryIncident
                key={historyIncidentKey(item.incident)}
                incident={item.incident}
                latestEvent={item.latestEvent}
                cleared={item.cleared}
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
    </section>
  );
}

const HistoryIncident = memo(function HistoryIncident({
  incident,
  latestEvent,
  cleared,
}: AlertHistoryViewItem) {
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
    !cause && category ? { label: "Source category", value: category } : null,
    incident.source ? { label: "Source", value: normalizeDashboardSourceLabel(incident.source) } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));

  return (
    <li
      className={`alert-history-item ${
        cleared
          ? "alert-history-event-cleared"
          : `alert-history-event-active alert-history-tone-${historyAlertTypeTone(incident.eventType)}`
      } transition-all`}
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
          </div>
        </div>
        <strong className="alert-history-title">{title}</strong>
        {description ? <p className="alert-history-description">{description}</p> : null}
        <div className="alert-history-fact-grid" aria-label="Alert summary">
          {incident.location ? (
            <span className="alert-history-fact alert-history-fact-location">
              <span>Affected area</span>
              <strong><CompactImpactLocation location={incident.location} /></strong>
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
          <p className="alert-history-observation-note">Times show when LineWatchTO observed changes. Cleared means the alert was no longer active in the feed.</p>
          {incident.sourceId ? <p className="alert-history-source-id">Source alert: {incident.sourceId}</p> : null}
          <ol>
            {events.map((event, index) => (
              <li
                key={event.id}
                className={`alert-history-lifecycle-event alert-history-lifecycle-${historyLifecycleTone(event.state)}`}
              >
                <span>{formatHistoryStatusLabel(event.label)}</span>
                <HistoryTimestamp timestamp={event.happenedAt} />
                <details className="alert-history-snapshot">
                  <summary>
                    Source details
                    {historyChangedFields(event, events[index + 1]).length > 0
                      ? ` · Changed: ${historyChangedFields(event, events[index + 1]).join(", ")}`
                      : ""}
                  </summary>
                  <strong>{event.title}</strong>
                  {historyDescription(event) ? <p className="alert-history-description">{historyDescription(event)}</p> : null}
                  {!event.description?.trim() ? <p>No description supplied in this snapshot.</p> : null}
                  <dl>
                    <dt>Affected area</dt><dd>{event.location || "Not supplied"}</dd>
                    <dt>Direction</dt><dd>{event.displayDirection || "Not supplied"}</dd>
                    <dt>Cause</dt><dd>{historyCause(event.cause) ? formatCause(event.cause!) : "Not supplied"}</dd>
                    <dt>Source</dt><dd>{normalizeDashboardSourceLabel(event.source)}</dd>
                  </dl>
                </details>
              </li>
            ))}
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
        {hasLine ? incident.lineName ?? `Line ${incident.lineNumber}` : "Line unavailable"}
      </span>
    </div>
  );
}

function lineLabel(incident: AlertHistoryIncident) {
  if (!incident.lineNumber) return "Line unavailable";
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
