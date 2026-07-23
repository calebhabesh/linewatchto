"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileText, LoaderCircle, Plus, Search, TriangleAlert, X } from "lucide-react";
import type { AccountSavedStation } from "../app/saved-station-data";
import type { ImpactSelection } from "../app/linewatch-data";
import { filterAndSortSavedStations, type SavedStationSort } from "../app/saved-stations";
import {
  formatArrivalSourceBadgeLabel,
  formatArrivalSourceSummary,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
  shouldUseDetailedArrivalCountdown,
} from "../app/station-arrivals";
import { getStationDetail, type StationDataResult, type StationDetail, type StationImpactSeverity, type StationSummary } from "../app/station-data";
import { useDashboardData } from "../app/DataContext";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";
import { TransitLineBadge } from "./TransitLineBadge";

type Props = {
  savedStations: AccountSavedStation[];
  stations: StationSummary[];
  loading: boolean;
  error: string | null;
  pendingStationIds: Set<string>;
  onSave: (stationId: string) => Promise<boolean>;
  onRemove: (stationId: string) => Promise<boolean>;
  onSelectStation: (stationId: string) => void;
  onSelectImpactDetails: (selection: NonNullable<ImpactSelection>) => void;
  onSelectAccessibilityOutageDetails: (assetType: "elevator" | "escalator", stationId: string) => void;
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
};

const LINES = [
  { id: "line-1", number: "1", name: "Yonge-University", color: "#F8C300", text: "#111827" },
  { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#00923F", text: "#ffffff" },
  { id: "line-4", number: "4", name: "Sheppard", color: "#A21A68", text: "#ffffff" },
  { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#EB8738", text: "#111827" },
  { id: "line-6", number: "6", name: "Finch West", color: "#969594", text: "#111827" },
] as const;

const SORT_OPTIONS: Array<{ value: SavedStationSort; label: string }> = [
  { value: "attention", label: "Needs Attention" },
  { value: "name", label: "Name A-Z" },
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "line", label: "Line" },
];

const LINE_OPTIONS: ToolbarSelectOption<string>[] = [
  { value: "all", label: "All Lines" },
  ...LINES.map((line) => ({ value: line.id, label: line.name, lineId: line.id })),
];

const SAVED_STATION_DETAIL_REFRESH_MS = 15_000;

type SavedStationDisruptionKind = StationImpactSeverity | "elevator" | "escalator";

function disruptionKindLabel(kind: SavedStationDisruptionKind) {
  switch (kind) {
    case "suspension": return "Suspension";
    case "delay": return "Delay";
    case "planned": return "Closure";
    case "elevator": return "Elevator Outage";
    case "escalator": return "Escalator Outage";
  }
}

function disruptionKindCountLabel(kind: SavedStationDisruptionKind, count: number) {
  const label = disruptionKindLabel(kind);
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function disruptionKindClassName(kind: SavedStationDisruptionKind) {
  return kind === "planned" ? "planned-closure" : kind;
}

function DisruptionIcon({ kind, size = 13 }: { kind: SavedStationDisruptionKind; size?: number }) {
  return kind === "elevator" || kind === "escalator"
    ? <AlertCircle size={size} aria-hidden="true" />
    : <TriangleAlert size={size} aria-hidden="true" />;
}

function stationImpactContext(
  impactId: string,
  stationName: string,
  dashboard: ReturnType<typeof useDashboardData>,
) {
  const match = dashboard.activeAlerts.find((impact) => impact.id === impactId)
    ?? dashboard.delays.find((impact) => impact.id === impactId)
    ?? dashboard.plannedClosures.find((impact) => impact.id === impactId)
    ?? dashboard.reducedSpeedZones.find((impact) => impact.id === impactId || impact.sourceAlertIds.includes(impactId));

  if (!match) return `Station: ${stationName}`;
  return `Line ${match.lineNumber}: ${match.location}${match.displayDirection ? ` (${match.displayDirection})` : ""}`;
}

function stationImpactSelection(
  impactId: string,
  dashboard: ReturnType<typeof useDashboardData>,
): NonNullable<ImpactSelection> | null {
  const reducedSpeedZone = dashboard.reducedSpeedZones.find(
    (impact) => impact.id === impactId || impact.sourceAlertIds.includes(impactId),
  );
  if (reducedSpeedZone) return { kind: "reduced-speed-zone", id: reducedSpeedZone.id };

  const activeAlert = dashboard.activeAlerts.find((impact) => impact.id === impactId);
  if (activeAlert) {
    const kind = activeAlert.severity === "planned"
      ? "planned-closure"
      : activeAlert.severity === "suspension"
        ? "suspension"
        : "delay";
    return { kind, id: activeAlert.id };
  }

  const delay = dashboard.delays.find((impact) => impact.id === impactId);
  if (delay) return { kind: "delay", id: delay.id };

  const plannedClosure = dashboard.plannedClosures.find((impact) => impact.id === impactId);
  if (plannedClosure) return { kind: "planned-closure", id: plannedClosure.id };

  return null;
}

function StationLineBadges({ lineIds }: { lineIds: string[] }) {
  return (
    <span className="my-stations-line-badges" aria-label={lineIds.map((id) => `Line ${id.replace("line-", "")}`).join(", ")}>
      {lineIds.map((id) => {
        const line = LINES.find((candidate) => candidate.id === id);
        if (!line) return null;
        return <TransitLineBadge key={id} lineId={id} lineNumber={line.number} size={28} decorative />;
      })}
    </span>
  );
}

function stationState(station: StationSummary) {
  const counts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const outageCount = counts.elevator + counts.escalator;
  const impactCount = (station.hasActiveImpact ? 1 : 0)
    + (outageCount > 0 ? outageCount : station.accessStatus === "outage" ? 1 : 0);
  return {
    count: impactCount,
    label: impactCount > 0 ? `${impactCount} Impact${impactCount === 1 ? "" : "s"}` : "No Impacts",
    tone: impactCount > 0 ? "impact" : "clear",
  };
}

function formatCondensedArrivalDirection(directionLabel: string) {
  const match = directionLabel.match(/^(Northbound|Southbound|Eastbound|Westbound)\s+to\s+(.+)$/i);
  if (!match) return { direction: directionLabel, destination: null };
  return { direction: match[1], destination: `To ${match[2]}` };
}

function SavedStationRow({
  saved,
  detailResult,
  subwayClosed,
  arrivalTick,
  pending,
  onOpen,
  onSelectImpactDetails,
  onSelectAccessibilityOutageDetails,
  onRemove,
}: {
  saved: AccountSavedStation;
  detailResult?: StationDataResult<StationDetail | null>;
  subwayClosed: boolean;
  arrivalTick: number;
  pending: boolean;
  onOpen: () => void;
  onSelectImpactDetails: (selection: NonNullable<ImpactSelection>) => void;
  onSelectAccessibilityOutageDetails: (assetType: "elevator" | "escalator", stationId: string) => void;
  onRemove: () => void;
}) {
  const dashboard = useDashboardData();
  const detail = detailResult?.data ?? null;
  const activeImpacts = detail?.impacts.filter((impact) => impact.type === "active-alert") ?? [];
  const accessOutages = detail?.access.outages ?? [];
  const disruptionCount = activeImpacts.length + accessOutages.length;
  const displayedDisruptionCount = detail ? disruptionCount : stationState(saved.station).count;
  const disruptionSummary = (() => {
    const counts = new Map<SavedStationDisruptionKind, number>();
    for (const impact of activeImpacts) counts.set(impact.severity, (counts.get(impact.severity) ?? 0) + 1);
    for (const outage of accessOutages) counts.set(outage.assetType, (counts.get(outage.assetType) ?? 0) + 1);
    const order: SavedStationDisruptionKind[] = ["suspension", "delay", "planned", "elevator", "escalator"];
    return order.flatMap((kind) => counts.has(kind) ? [{ kind, count: counts.get(kind) ?? 0 }] : []);
  })();
  const hasUnavailableArrivals = detail?.arrivals.some((arrival) => arrival.status === "unavailable") ?? false;
  const hasLiveArrivals = detail?.arrivals.some((arrival) => arrival.status === "live") ?? false;
  const arrivalGroups = detail && !hasUnavailableArrivals
    ? groupStationArrivals(detail.arrivals, detail.lines, {
        stationId: detail.id,
        maxArrivalsPerDirection: 2,
        includeEmptyDirections: hasLiveArrivals,
      })
    : [];

  return (
    <article className={`my-stations-row saved-station-rich-row ${displayedDisruptionCount > 0 ? "is-affected" : "is-clear"}`}>
      <div className="saved-station-rich-heading">
        <button type="button" className="my-stations-row-main" onClick={onOpen}>
          <span className="my-stations-row-copy">
            <span className="my-stations-row-heading">
              <strong>{saved.station.name}</strong>
              <StationLineBadges lineIds={saved.station.lineIds} />
            </span>
          </span>
          <span className="saved-station-open-action">
            <span>Open Station</span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          className="my-stations-bookmark saved"
          onClick={onRemove}
          disabled={pending}
          aria-pressed="true"
          aria-label={`Remove ${saved.station.name} from My Stations`}
        >
          <Bookmark size={20} fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      {!detailResult ? (
        <div className="saved-station-detail-loading" role="status">
          <LoaderCircle size={15} aria-hidden="true" />
          Loading station information...
        </div>
      ) : !detail ? (
        <div className="saved-station-detail-loading">Station information is unavailable.</div>
      ) : (
        <div className="saved-station-rich-content">
          <details className={`saved-commute-impact-disclosure saved-station-disruption-disclosure${disruptionCount === 0 ? " is-clear" : ""}`}>
            <summary className="saved-commute-impact-summary saved-station-disruption-summary">
              <span className="saved-commute-impact-summary-heading saved-station-disruption-heading">
                {disruptionCount > 0 ? <AlertCircle className="saved-commute-impact-summary-icon" size={16} aria-hidden="true" /> : <span className="saved-station-clear-dot" aria-hidden="true" />}
                <strong>{disruptionCount > 0 ? "Active Disruptions" : "No Active Disruptions"}</strong>
                <span className="saved-commute-impact-total saved-station-disruption-total">{disruptionCount}</span>
              </span>
              {disruptionCount > 0 ? (
                <span className="saved-commute-impact-summary-chips saved-station-disruption-chips">
                  {disruptionSummary.map(({ kind, count }) => (
                    <span key={kind} className={`saved-commute-impact-summary-chip kind-${disruptionKindClassName(kind)}`}>
                      <DisruptionIcon kind={kind} size={12} />
                      {disruptionKindCountLabel(kind, count)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="saved-commute-impact-summary-action saved-station-disruption-action">
                <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                <ChevronDown className="saved-commute-impact-summary-chevron" size={15} aria-hidden="true" />
              </span>
            </summary>
            {disruptionCount > 0 ? (
              <ul className="saved-commute-impact-list saved-station-disruption-list">
                {activeImpacts.map((impact) => (
                  <li key={impact.id} className={`kind-${disruptionKindClassName(impact.severity)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={impact.severity} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(impact.severity)}</span></strong></div>
                        <span>{stationImpactContext(impact.id, saved.station.name, dashboard)}</span>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => {
                            const impactSelection = stationImpactSelection(impact.id, dashboard);
                            if (impactSelection) onSelectImpactDetails(impactSelection);
                            else onOpen();
                          }}
                          aria-label={`View ${saved.station.name} alert details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {accessOutages.map((outage) => (
                  <li key={outage.id} className={`kind-${disruptionKindClassName(outage.assetType)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={outage.assetType} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(outage.assetType)}</span></strong></div>
                        <span>Station: {saved.station.name}</span>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => onSelectAccessibilityOutageDetails(outage.assetType, saved.station.id)}
                          aria-label={`View ${saved.station.name} ${outage.assetType} outage details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="saved-station-disruption-clear-copy">No directly linked service impacts or accessibility outages.</p>}
          </details>

          <section className="saved-station-arrivals" aria-label={`Arrivals at ${saved.station.name}`}>
            <div className="station-arrival-line-divider saved-station-section-divider" aria-hidden="true" />
            <div className="saved-station-arrivals-heading">
              <span><Clock3 size={15} aria-hidden="true" /><strong>Arrivals</strong></span>
              <small>{formatArrivalSourceSummary(detail.arrivals, detail.arrivalsSource)}</small>
            </div>
            {subwayClosed ? (
              <p className="saved-station-arrivals-empty">Subway Closed · Arrivals Not Available</p>
            ) : hasUnavailableArrivals ? (
              <p className="saved-station-arrivals-empty">Arrival Data Unavailable</p>
            ) : arrivalGroups.length === 0 ? (
              <p className="saved-station-arrivals-empty">No Arrivals Available</p>
            ) : (
              <div className="saved-station-arrival-groups">
                {arrivalGroups.map((group) => {
                  const sourceLabel = formatArrivalSourceBadgeLabel(group.arrivals, {
                    emptyLiveDirection: hasLiveArrivals && group.arrivals.length === 0,
                  });
                  const direction = formatCondensedArrivalDirection(group.directionLabel);
                  return (
                    <div className="saved-station-arrival-group" key={group.key}>
                      <TransitLineBadge lineId={group.lineId} lineNumber={group.lineNumber} lineName={group.line?.name} size={30} />
                      <span className="saved-station-arrival-direction">
                        <strong>{direction.direction}</strong>
                        {direction.destination ? <span className="saved-station-arrival-destination">{direction.destination}</span> : null}
                      </span>
                      <span className={`saved-station-arrival-source source-${sourceLabel.toLowerCase().replaceAll(" ", "-")}`}>{sourceLabel}</span>
                      <span className="saved-station-arrival-times">
                        {group.arrivals.length > 0
                          ? group.arrivals.map((arrival, index) => {
                              const detailed = index === 0 && shouldUseDetailedArrivalCountdown(arrival, arrivalTick);
                              const due = isArrivalDue(arrival, arrivalTick);
                              return (
                                <strong
                                  className={[detailed ? "is-detailed is-soon" : "", due ? "is-due" : ""].filter(Boolean).join(" ") || undefined}
                                  key={`${arrival.predictedAt ?? arrival.label}-${index}`}
                                >
                                  {formatArrivalTileLabel(arrival, { detailedCountdown: detailed, now: arrivalTick })}
                                </strong>
                              );
                            })
                          : <em>—</em>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {detailResult.source === "fallback" ? <p className="saved-station-source-note">Showing local demo station data.</p> : null}
        </div>
      )}
    </article>
  );
}

export function MyStationsPanel({
  savedStations,
  stations,
  loading,
  error,
  pendingStationIds,
  onSave,
  onRemove,
  onSelectStation,
  onSelectImpactDetails,
  onSelectAccessibilityOutageDetails,
  onRetry,
  onBack,
  onClose,
}: Props) {
  const [mode, setMode] = useState<"list" | "add">("list");
  const [query, setQuery] = useState("");
  const [lineId, setLineId] = useState("all");
  const [sort, setSort] = useState<SavedStationSort>("attention");
  const [lastRemoved, setLastRemoved] = useState<{ saved: AccountSavedStation; index: number } | null>(null);
  const [stationDetails, setStationDetails] = useState<Record<string, StationDataResult<StationDetail | null>>>({});
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const subwayOperatingState = useSubwayOperatingState();
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const savedIds = useMemo(() => new Set(savedStations.map((saved) => saved.station.id)), [savedStations]);
  const visible = useMemo(
    () => filterAndSortSavedStations(savedStations, query, lineId, sort),
    [savedStations, query, lineId, sort],
  );
  const pickerStations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-CA");
    return stations
      .filter((station) => !needle || station.name.toLocaleLowerCase("en-CA").includes(needle))
      .filter((station) => lineId === "all" || station.lineIds.includes(lineId))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, "en-CA"));
  }, [lineId, query, stations]);
  const pickerGroups = useMemo(() => {
    if (query.trim()) {
      return [{ id: "search-results", label: "Search Results", line: null, stations: pickerStations }];
    }

    return LINES
      .filter((line) => lineId === "all" || line.id === lineId)
      .map((line) => ({
        id: line.id,
        label: `Line ${line.number} ${line.name}`,
        line,
        stations: pickerStations.filter((station) => station.lineIds.includes(line.id)),
      }))
      .filter((group) => group.stations.length > 0);
  }, [lineId, pickerStations, query]);
  const compactEmpty = mode === "list" && !loading && !error && savedStations.length === 0 && !lastRemoved;

  const visibleStationIds = useMemo(
    () => visible.map((saved) => saved.station.id).join(","),
    [visible],
  );

  useEffect(() => {
    if (mode !== "list" || !visibleStationIds) return;
    let cancelled = false;
    const stationIds = visibleStationIds.split(",");

    const refresh = async () => {
      const results = await Promise.all(stationIds.map(async (stationId) => [stationId, await getStationDetail(stationId)] as const));
      if (!cancelled) {
        setStationDetails((current) => ({ ...current, ...Object.fromEntries(results) }));
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, SAVED_STATION_DETAIL_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, visibleStationIds]);

  useEffect(() => {
    const interval = window.setInterval(() => setArrivalTick(Date.now()), 3_000);
    return () => window.clearInterval(interval);
  }, []);

  async function remove(saved: AccountSavedStation, index: number) {
    setLastRemoved({ saved, index });
    if (!(await onRemove(saved.station.id))) {
      setLastRemoved((current) => current?.saved.station.id === saved.station.id ? null : current);
    }
  }

  async function undoRemove() {
    if (!lastRemoved) return;
    const restored = await onSave(lastRemoved.saved.station.id);
    if (restored) setLastRemoved(null);
  }

  function leavePicker() {
    setMode("list");
    setQuery("");
    setLineId("all");
    window.setTimeout(() => modeButtonRef.current?.focus(), 0);
  }

  return (
    <section className={`my-stations-panel${compactEmpty ? " my-stations-panel-empty" : ""} panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl`} aria-label="My Stations">
      <div className="panel-heading my-stations-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="my-stations-title flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => mode === "add" ? leavePicker() : onBack()}
            className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label={mode === "add" ? "Back to My Stations" : "Back"}
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <Bookmark className="my-stations-title-icon w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-sky-500 shrink-0" fill="none" aria-hidden="true" />
            <span>My Stations</span>
          </h2>
        </div>
        <div className="my-stations-heading-actions flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="my-stations-count" aria-label={`${savedStations.length} saved stations`}>{savedStations.length}</span>
          <button type="button" className="my-stations-close p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center" onClick={onClose} aria-label="Close My Stations">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div className="my-stations-body">
        <div className="my-stations-controls">
          <div className="my-stations-controls-top">
            <label className={`impact-list-search my-stations-search${mode === "add" ? " picker-nudge" : ""}`}>
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">{mode === "add" ? "Search all stations" : "Search saved stations"}</span>
              <input
                type="search"
                className="submenu-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "add" ? "Search All Stations..." : "Search saved stations..."}
              />
            </label>
            <button
              ref={modeButtonRef}
              type="button"
              className={`my-stations-mode-action ${mode === "list" ? "my-stations-add" : "my-stations-done"}`}
              onClick={() => {
                if (mode === "add") {
                  leavePicker();
                } else {
                  setMode("add");
                  setQuery("");
                  setLineId("all");
                }
              }}
              aria-label={mode === "list" ? "Add Station" : "Done adding stations"}
            >
              <span key={mode} className="my-stations-mode-action-content">
                {mode === "list" ? <Plus size={16} aria-hidden="true" /> : null}
                {mode === "list" ? (
                  <>
                    <span className="my-stations-add-wide">Add Station</span>
                    <span className="my-stations-add-compact">Add</span>
                  </>
                ) : <span>Done</span>}
              </span>
            </button>
          </div>
          <div className="my-stations-selects">
            <ToolbarSelectMenu
              ariaLabel="Filter stations by line"
              prefix="Line"
              value={lineId}
              options={LINE_OPTIONS}
              onChange={setLineId}
            />
            <ToolbarSelectMenu
              ariaLabel="Sort saved stations"
              prefix="Sort"
              value={mode === "add" ? "name" : sort}
              options={SORT_OPTIONS}
              onChange={setSort}
              disabled={mode === "add"}
            />
          </div>
        </div>

        {error ? (
          <div className="my-stations-empty" role="alert">
            <p>Could not load saved stations</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : loading ? (
          <div className="my-stations-empty" role="status"><p>Loading saved stations...</p></div>
        ) : mode === "add" ? (
          <div className="my-stations-list my-stations-picker-list" aria-label="Add stations">
            {pickerGroups.map((group) => (
              <section className="my-stations-picker-section" key={group.id} aria-labelledby={`station-group-${group.id}`}>
                <h3
                  id={`station-group-${group.id}`}
                  className={`my-stations-picker-section-heading${group.line ? " has-line-accent" : ""}`}
                  style={group.line ? { borderLeftColor: group.line.color } : undefined}
                >
                  {group.line ? (
                    <TransitLineBadge lineId={group.line.id} lineNumber={group.line.number} lineName={group.line.name} size={28} className="my-stations-picker-line-number" />
                  ) : null}
                  <span>{group.label}</span>
                  <span className="my-stations-picker-section-count">{group.stations.length}</span>
                </h3>
                <div className="my-stations-picker-section-rows">
                  {group.stations.map((station) => {
                    const saved = savedIds.has(station.id);
                    const pending = pendingStationIds.has(station.id);
                    return (
                      <div className="my-stations-picker-row" key={`${group.id}-${station.id}`}>
                        <span className="my-stations-row-copy">
                          <span className="my-stations-row-heading"><strong>{station.name}</strong><StationLineBadges lineIds={station.lineIds} /></span>
                          <span className={`my-stations-state ${stationState(station).tone}`}>{stationState(station).label}</span>
                        </span>
                        <button
                          type="button"
                          className={`my-stations-picker-action${saved ? " saved" : ""}`}
                          onClick={() => saved ? void onRemove(station.id) : void onSave(station.id)}
                          disabled={pending}
                          aria-pressed={saved}
                          aria-label={saved ? `Remove ${station.name} from My Stations` : `Save ${station.name} to My Stations`}
                        >
                          <Bookmark size={24} fill={saved ? "currentColor" : "none"} />
                          <span>{pending ? (saved ? "Removing..." : "Saving...") : saved ? "Saved" : "Save"}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {pickerStations.length === 0 ? <div className="my-stations-empty"><p>No Stations Match</p></div> : null}
          </div>
        ) : savedStations.length === 0 && !lastRemoved ? (
          <div className="my-stations-empty">
            <p>No Saved Stations</p>
          </div>
        ) : visible.length === 0 && !lastRemoved ? (
          <div className="my-stations-empty">
            <p>No Saved Stations Match</p>
            <button type="button" onClick={() => { setQuery(""); setLineId("all"); }}>Clear Filters</button>
          </div>
        ) : (
          <div className="my-stations-list" aria-label="Saved stations">
            {visible.map((saved, index) => (
              <div className="saved-station-list-slot" key={saved.station.id}>
                {lastRemoved?.index === index ? (
                  <div className="saved-station-inline-undo" role="status">
                    <span>{lastRemoved.saved.station.name} removed</span>
                    <button type="button" onClick={() => void undoRemove()}>Undo</button>
                    <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
                  </div>
                ) : null}
                <SavedStationRow
                  saved={saved}
                  detailResult={stationDetails[saved.station.id]}
                  subwayClosed={subwayOperatingState.status === "closed"}
                  arrivalTick={arrivalTick}
                  pending={pendingStationIds.has(saved.station.id)}
                  onOpen={() => onSelectStation(saved.station.id)}
                  onSelectImpactDetails={onSelectImpactDetails}
                  onSelectAccessibilityOutageDetails={onSelectAccessibilityOutageDetails}
                  onRemove={() => void remove(saved, index)}
                />
              </div>
            ))}
            {lastRemoved && lastRemoved.index >= visible.length ? (
              <div className="saved-station-inline-undo" role="status">
                <span>{lastRemoved.saved.station.name} removed</span>
                <button type="button" onClick={() => void undoRemove()}>Undo</button>
                <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
              </div>
            ) : null}
            {savedStations.length === 0 && lastRemoved ? (
              <div className="my-stations-empty saved-station-empty-after-removal">
                <p>No Saved Stations</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
