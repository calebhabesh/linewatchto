"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock3, Construction, Loader2, Search } from "lucide-react";
import {
  getAlertHistory,
  type AlertHistoryIncident,
  type AlertHistoryPeriod,
} from "../app/alert-history-data";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { formatFullImpactTimestamp, formatImpactTimestamp } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { CompactImpactLocation, formatCause } from "./ImpactCardFields";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import {
  ALL_LINES_VALUE,
  buildAlertHistoryLineOptions,
  buildAlertHistorySortOptions,
  filterAndSortAlertHistory,
  formatAlertTypeName,
  MOST_RECENT_SORT_VALUE,
  type AlertHistoryLifecycleFilter,
  type AlertHistoryViewItem,
} from "./alert-history-filters";

const PERIODS: Array<{ value: AlertHistoryPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const FILTERS: Array<{ value: AlertHistoryLifecycleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "alerts", label: "Alerts" },
  { value: "clearances", label: "Clearances" },
];

function renderSortOptionIcon(value: string) {
  if (value === MOST_RECENT_SORT_VALUE) {
    return <Clock3 size={14} className="text-slate-400 shrink-0" aria-hidden="true" />;
  }
  if (value === "suspension") {
    return <AlertTriangle size={14} className="text-red-500 shrink-0" aria-hidden="true" />;
  }
  if (value === "delay") {
    return <DelayIcon size={14} className="text-amber-500 dark:text-amber-400 shrink-0" aria-hidden="true" />;
  }
  if (value === "reduced-speed-zone") {
    return <Construction size={14} className="rsz-tone shrink-0" aria-hidden="true" />;
  }
  if (value === "planned-closure") {
    return <PlannedClosureIcon size={14} className="text-blue-500 dark:text-blue-400 shrink-0" aria-hidden="true" />;
  }
  return <AlertTriangle size={14} className="text-slate-400 shrink-0" aria-hidden="true" />;
}

export function AlertHistoryTimeline({ network }: { network: NetworkId }) {
  const [period, setPeriod] = useState<AlertHistoryPeriod>("today");
  const [filter, setFilter] = useState<AlertHistoryLifecycleFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLineId, setSelectedLineId] = useState(ALL_LINES_VALUE);
  const [selectedSortBy, setSelectedSortBy] = useState(MOST_RECENT_SORT_VALUE);
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [history, setHistory] = useState<AlertHistoryIncident[]>([]);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(target)) {
        setIsLineDropdownOpen(false);
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
  const [source, setSource] = useState<"backend" | "fallback">("fallback");
  const requestedQuery = `${network}:${period}`;

  useEffect(() => {
    let cancelled = false;
    getAlertHistory(period, network).then((result) => {
      if (cancelled) return;
      setHistory(result.data.incidents);
      setSource(result.source);
      setLoadedQuery(requestedQuery);
    });
    return () => {
      cancelled = true;
    };
  }, [network, period, requestedQuery]);

  const loading = loadedQuery !== requestedQuery;

  const lineOptions = useMemo(() => buildAlertHistoryLineOptions(history).map((option) => (
    network === "regional" && option.value === ALL_LINES_VALUE
      ? { ...option, label: "All Corridors" }
      : option
  )), [history, network]);
  const sortOptions = useMemo(() => buildAlertHistorySortOptions(history), [history]);

  if (selectedLineId !== ALL_LINES_VALUE && !lineOptions.some((option) => option.value === selectedLineId)) {
    setSelectedLineId(ALL_LINES_VALUE);
  }

  const visibleItems = useMemo(() => filterAndSortAlertHistory(history, {
    lifecycleFilter: filter,
    lineId: selectedLineId,
    searchQuery,
    sortBy: selectedSortBy,
  }), [filter, history, searchQuery, selectedLineId, selectedSortBy]);

  const selectedLineOption = useMemo(() => {
    return lineOptions.find((o) => o.value === selectedLineId);
  }, [lineOptions, selectedLineId]);

  const selectedSortOption = useMemo(() => {
    return sortOptions.find((o) => o.value === selectedSortBy) ?? sortOptions[0];
  }, [sortOptions, selectedSortBy]);

  return (
    <section className="alert-history-timeline notification-settings-section" aria-label="Alert history timeline">
      <div className="notification-settings-section-header">
        <h3>Service Alert History</h3>
        <span>{source === "backend" ? "Lifecycle" : "Unavailable"}</span>
      </div>

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
        <div className="alert-history-chip-group" aria-label="History event type">
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
            <div className="alert-history-line-filter relative" ref={lineDropdownRef}>
              <span className="alert-history-control-prefix">{network === "regional" ? "Corridor" : "Line"}</span>
              <button
                type="button"
                className="alert-history-line-filter-trigger"
                onClick={() => {
                  setIsLineDropdownOpen((prev) => !prev);
                  setIsSortDropdownOpen(false);
                }}
                aria-label="Transit line"
                aria-expanded={isLineDropdownOpen}
              >
                {selectedLineOption?.lineNumber && selectedLineOption?.lineId ? (
                  <span className="flex items-center gap-2 min-w-0">
                    <TransitLineBadge lineId={selectedLineOption.lineId} lineNumber={selectedLineOption.lineNumber} size={24} className="shrink-0" />
                    {selectedLineOption.lineName && <span className="truncate">{selectedLineOption.lineName}</span>}
                  </span>
                ) : (
                  <span className="truncate">{selectedLineOption?.label ?? "All Lines"}</span>
                )}
                <ChevronDown size={14} className="shrink-0 ml-1" aria-hidden="true" />
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
                            <TransitLineBadge lineId={option.lineId} lineNumber={option.lineNumber} size={24} className="shrink-0" />
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

            <div className="alert-history-line-filter relative" ref={sortDropdownRef}>
              <span className="alert-history-control-prefix">Sort</span>
              <button
                type="button"
                className="alert-history-line-filter-trigger"
                onClick={() => {
                  setIsSortDropdownOpen((prev) => !prev);
                  setIsLineDropdownOpen(false);
                }}
                aria-label="Sort alert history"
                aria-expanded={isSortDropdownOpen}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {renderSortOptionIcon(selectedSortOption.value)}
                  <span className="truncate">{selectedSortOption.label}</span>
                </span>
                <ChevronDown size={14} className="shrink-0 ml-1" aria-hidden="true" />
              </button>
              {isSortDropdownOpen && (
                <ul className="alert-history-line-filter-options">
                  {sortOptions.map((option) => (
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
          No alert lifecycle events match the selected filters.
        </p>
      ) : (
        <ol className="alert-history-list">
          {visibleItems.map((item) => (
            <HistoryIncident
              key={`${item.incident.alertId}-${item.displayEvent?.id ?? item.incident.clearedAt ?? item.incident.firstSeenAt ?? item.incident.title}`}
              item={item}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function HistoryIncident({ item }: { item: AlertHistoryViewItem }) {
  const { incident, displayEvent, cleared } = item;
  const time = displayEvent?.happenedAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  const title = compactHistoryTitle(incident);
  const statusLabel = cleared ? "Cleared" : formatHistoryStatusLabel(displayEvent?.label);
  const facts = [
    incident.displayDirection ? { label: "Direction", value: incident.displayDirection } : null,
    incident.cause ? { label: "Cause", value: formatCause(incident.cause) } : null,
    incident.source ? { label: "Source", value: normalizeDashboardSourceLabel(incident.source) } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));

  return (
    <li className={`alert-history-item ${cleared ? "alert-history-event-cleared" : "alert-history-event-active"}`}>
      <div className="alert-history-content">
        <div className="alert-history-card-heading">
          <div className="alert-history-line-status">
            <HistoryLineIdentity incident={incident} />
            <HistoryAlertType eventType={incident.eventType} />
            <span className="alert-history-status-label">
              {cleared ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
              {statusLabel}
            </span>
          </div>
          {time ? <HistoryTimestamp timestamp={time} /> : null}
        </div>
        <strong className="alert-history-title">{title}</strong>
        <div className="alert-history-fact-grid" aria-label="Alert summary">
          {incident.location ? (
            <span className="alert-history-fact">
              <span>Location</span>
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
                {incident.durationMinutes} min
              </strong>
            </span>
          ) : null}
        </div>
        <details className="alert-history-details">
          <summary>Lifecycle details</summary>
          <ol>
            {incident.events.map((event) => (
              <li key={event.id}>
                <span>{event.label}</span>
                <HistoryTimestamp timestamp={event.happenedAt} />
              </li>
            ))}
          </ol>
        </details>
      </div>
    </li>
  );
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
  if (["suspension", "delay", "reduced-speed-zone", "planned-closure"].includes(eventType)) {
    return eventType;
  }
  return "other";
}

function HistoryTimestamp({ timestamp }: { timestamp: string }) {
  return (
    <time dateTime={timestamp} title={formatFullImpactTimestamp(timestamp)} suppressHydrationWarning>
      {formatImpactTimestamp(timestamp)}
    </time>
  );
}

function HistoryLineIdentity({ incident }: { incident: AlertHistoryIncident }) {
  if (!incident.lineId || !incident.lineNumber) {
    return <span className="alert-history-line-identity unknown">Line unavailable</span>;
  }

  return (
    <span className="alert-history-line-identity inline-flex min-h-6 max-w-full min-w-0 items-center gap-1.5 text-[11px] font-black" aria-label={lineLabel(incident)}>
      <TransitLineBadge lineId={incident.lineId} lineNumber={incident.lineNumber} lineName={incident.lineName ?? undefined} size={24} decorative />
      <span className="alert-history-line-name min-w-0 truncate">{incident.lineName ?? `Line ${incident.lineNumber}`}</span>
    </span>
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
