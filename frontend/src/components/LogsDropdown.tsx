"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { apiUrl } from "../app/api-client.ts";
import { formatImpactTimestamp } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { RawAlertDiagnostics } from "./RawAlertDiagnostics";

type Props = {
  isMobileMore?: boolean;
  network?: NetworkId;
};

type TtcIngestionHealth = {
  status: string;
  dashboardLive: boolean;
  startedAt: string | null;
  completedAt: string | null;
  recordsFetched: number;
  recordsStaged: number;
  recordsNormalized: number;
  recordsUnmatched: number;
  sourceFeedUpdatedAt: string | null;
  feedAvailability?: FeedAvailability;
  sourceEndpoint?: string | null;
};

type FeedAvailabilityDay = {
  date: string;
  status: "up" | "degraded" | "down" | "unknown";
  successfulChecks: number;
  failedChecks: number;
  totalChecks: number;
};

type FeedAvailability = {
  periodDays: number;
  availabilityPercentage: number | null;
  monitoringCoveragePercentage: number;
  successfulChecks: number;
  failedChecks: number;
  totalChecks: number;
  monitoringStartedOn: string | null;
  buckets: FeedAvailabilityDay[];
};

type RegionalCollectionHealth = {
  sourceSystem: string;
  label: string;
  kind: "rider-alert" | "operational";
  required: boolean;
  status: "complete" | "unavailable" | "unknown" | "not-evaluated" | "not-run";
  recordsFetched: number;
  sourceUpdatedAt: string | null;
};

type RegionalIngestionHealth = {
  fresh: boolean;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  sourceUpdatedAt: string | null;
  recordsFetched: number;
  recordsNormalized: number;
  collections: RegionalCollectionHealth[];
  feedAvailability?: FeedAvailability;
  sourceEndpoints?: string[];
};

type RegionalScheduleHealth = {
  status: string;
  scheduleActive: boolean;
  lookaheadCovered: boolean;
  requiredThrough: string;
  mappedStationLines: number;
};

type DiagnosticsCapabilities = {
  rawAlertsEnabled: boolean;
};

export function LogsDropdown({ isMobileMore = false, network = "ttc" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [ttcHealth, setTtcHealth] = useState<TtcIngestionHealth | null>(null);
  const [regionalHealth, setRegionalHealth] = useState<RegionalIngestionHealth | null>(null);
  const [regionalScheduleHealth, setRegionalScheduleHealth] = useState<RegionalScheduleHealth | null>(null);
  const [rawAlertsEnabled, setRawAlertsEnabled] = useState(false);
  const [activeView, setActiveView] = useState<"status" | "records">("status");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const closeDropdown = useCallback(() => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    const reducedMotion = Boolean(dropdownRef.current?.closest(".motion-paused"))
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, reducedMotion ? 0 : 220);
  }, [isClosing, isOpen]);

  const toggleDropdown = () => {
    if (isOpen) {
      closeDropdown();
      return;
    }
    setIsClosing(false);
    setIsOpen(true);
  };

  const fetchJson = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(apiUrl(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`Source status request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(false);

    if (network === "regional") {
      const [ingestion, schedule, capabilities] = await Promise.allSettled([
        fetchJson<RegionalIngestionHealth>("/api/health/regional-ingestion"),
        fetchJson<RegionalScheduleHealth>("/api/health/regional-schedule"),
        fetchJson<DiagnosticsCapabilities>("/api/diagnostics/capabilities"),
      ]);
      setRegionalHealth(ingestion.status === "fulfilled" ? ingestion.value : null);
      setRegionalScheduleHealth(schedule.status === "fulfilled" ? schedule.value : null);
      setTtcHealth(null);
      setRawAlertsEnabled(capabilities.status === "fulfilled" && capabilities.value.rawAlertsEnabled);
      setError(ingestion.status === "rejected" || schedule.status === "rejected");
    } else {
      const [ingestion, capabilities] = await Promise.allSettled([
        fetchJson<TtcIngestionHealth>("/api/health/ingestion"),
        fetchJson<DiagnosticsCapabilities>("/api/diagnostics/capabilities"),
      ]);
      setTtcHealth(ingestion.status === "fulfilled" ? ingestion.value : null);
      setRegionalHealth(null);
      setRegionalScheduleHealth(null);
      setRawAlertsEnabled(capabilities.status === "fulfilled" && capabilities.value.rawAlertsEnabled);
      setError(ingestion.status === "rejected");
    }

    setLoading(false);
  }, [fetchJson, network]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    if (isOpen) {
      void Promise.resolve().then(refreshStatus);
    }
  }, [isOpen, refreshStatus]);

  const fresh = network === "regional" ? regionalHealth?.fresh : ttcHealth?.dashboardLive;
  const status = network === "regional" ? regionalHealth?.status : ttcHealth?.status;
  const completedAt = network === "regional" ? regionalHealth?.completedAt : ttcHealth?.completedAt;
  const sourceUpdatedAt = network === "regional" ? regionalHealth?.sourceUpdatedAt : ttcHealth?.sourceFeedUpdatedAt;

  return (
    <div className={`relative ${isMobileMore ? "w-full" : "pointer-events-auto order-last"}`} ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={
          isMobileMore
            ? "mobile-more-row w-full flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            : "logs-trigger-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] text-slate-800 dark:text-white"
        }
        aria-label="Toggle Source Status"
        aria-expanded={isOpen && !isClosing}
      >
        <span className="flex items-center gap-3">
          <Activity
            aria-hidden="true"
            className={`shrink-0 ${
              isMobileMore
                ? "w-[18px] h-[18px] text-slate-500 dark:text-slate-400"
                : "w-[18px] h-[18px] sm:w-[24px] sm:h-[24px] text-red-600 dark:text-red-400"
            }`}
          />
          {isMobileMore ? <span>{network === "regional" ? "GO / UP Source Status" : "TTC Source Status"}</span> : null}
        </span>
        {isMobileMore ? <span className="text-slate-400">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span> : null}
      </button>

      {isOpen ? (
        <div
          className={`logs-dropdown-panel source-status-panel utility-popover ${isClosing ? "utility-popover--closing" : "utility-popover--opening"} absolute top-[48px] sm:top-[64px] ${isMobileMore ? "left-0 right-0 w-full" : "right-0 w-[min(calc(100vw-32px),550px)]"} rounded-2xl shadow-2xl flex flex-col z-50 bg-white/95 dark:bg-[#0a0c10]/95 backdrop-blur-md text-slate-800 dark:text-slate-200`}
          data-popover-state={isClosing ? "closing" : "open"}
        >
          <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <Activity size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
              <strong className="text-sm font-bold tracking-wide truncate">
                {network === "regional" ? "GO / UP Source Status" : "TTC Source Status"}
              </strong>
              {error ? (
                <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-amber-500/20 shrink-0">
                  Partial
                </span>
              ) : null}
            </div>
            <button
              onClick={() => void refreshStatus()}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh source status"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {rawAlertsEnabled ? (
            <div className="grid grid-cols-2 border-b border-black/10 px-4 dark:border-white/10" role="tablist" aria-label="Source diagnostics view">
              <button
                role="tab"
                aria-selected={activeView === "status"}
                onClick={() => setActiveView("status")}
                className={`cursor-pointer border-b-2 px-2 py-2.5 text-xs font-bold transition-colors ${activeView === "status"
                  ? "border-blue-500 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                Source status
              </button>
              <button
                role="tab"
                aria-selected={activeView === "records"}
                onClick={() => setActiveView("records")}
                className={`cursor-pointer border-b-2 px-2 py-2.5 text-xs font-bold transition-colors ${activeView === "records"
                  ? "border-amber-500 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                Source records
              </button>
            </div>
          ) : null}

          <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-3">
            {activeView === "records" && rawAlertsEnabled ? (
              <RawAlertDiagnostics network={network} />
            ) : loading && !ttcHealth && !regionalHealth ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                <span className="text-xs text-slate-500">Checking source status...</span>
              </div>
            ) : !ttcHealth && !regionalHealth ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                <AlertCircle className="w-6 h-6" />
                <span className="text-xs">Source status is unavailable.</span>
              </div>
            ) : (
              <>
                <section className="source-status-card rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Dashboard feed</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${fresh
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
                    >
                      {fresh ? "Fresh" : "Not fresh"}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-slate-500 dark:text-slate-400">Availability</dt>
                    <dd className="text-right font-semibold capitalize">{status?.replaceAll("-", " ") ?? "Unavailable"}</dd>
                    <dt className="text-slate-500 dark:text-slate-400">Last completed</dt>
                    <dd className="text-right font-semibold">{completedAt ? formatImpactTimestamp(completedAt) : "Not available"}</dd>
                    <dt className="text-slate-500 dark:text-slate-400">Source updated</dt>
                    <dd className="text-right font-semibold">{sourceUpdatedAt ? formatImpactTimestamp(sourceUpdatedAt) : "Not Reported"}</dd>
                  </dl>
                </section>

                {network === "regional" && regionalHealth ? (
                  <>
                    {regionalHealth.feedAvailability ? (
                      <FeedAvailabilitySummary
                        availability={regionalHealth.feedAvailability}
                        sourceEndpoints={regionalHealth.sourceEndpoints ?? []}
                        endpointLabels={["GO Service Alerts", "UP Express Alerts"]}
                        sharedPathSegments={1}
                        sourceLabel="required Metrolinx alert feeds"
                        note="Required GO and UP alert requests only. Supplemental collections and LineWatchTO processing failures are excluded."
                      />
                    ) : null}
                    <RegionalCoverage health={regionalHealth} schedule={regionalScheduleHealth} />
                  </>
                ) : ttcHealth ? (
                  <>
                    {ttcHealth.feedAvailability ? (
                      <FeedAvailabilitySummary
                        availability={ttcHealth.feedAvailability}
                        sourceEndpoints={ttcHealth.sourceEndpoint ? [ttcHealth.sourceEndpoint] : []}
                        endpointLabels={["TTC Live Alerts"]}
                        sharedPathSegments={0}
                        sourceLabel="TTC Live Alerts feed"
                        note="TTC Live Alerts requests only. LineWatchTO processing failures are excluded."
                      />
                    ) : null}
                    <TtcCoverage health={ttcHealth} />
                  </>
                ) : null}

                <p className="source-status-note rounded-lg bg-blue-500/5 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {rawAlertsEnabled
                    ? "Source records are available only because this non-production environment explicitly enables diagnostics. Production shows this sanitized status view only."
                    : "This public panel shows allowlisted source health and normalization counts only. Rider-facing disruption summaries appear in the dashboard; original source records are not publicly exposed."}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedAvailabilitySummary({
  availability,
  sourceEndpoints,
  endpointLabels,
  sharedPathSegments,
  sourceLabel,
  note,
}: {
  availability: FeedAvailability;
  sourceEndpoints: string[];
  endpointLabels: string[];
  sharedPathSegments: number;
  sourceLabel: string;
  note: string;
}) {
  const percentage = availability.availabilityPercentage === null
    ? "Collecting"
    : `${formatPercentage(availability.availabilityPercentage)}%`;
  const firstBucket = availability.buckets[0];
  const endpointGroup = formatApiEndpointGroup(
    sourceEndpoints,
    endpointLabels,
    sharedPathSegments,
  );

  return (
    <section
      className="source-status-card rounded-lg bg-slate-50 p-3 dark:bg-white/5"
      aria-labelledby="feed-availability-heading"
      data-feed-availability
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="feed-availability-heading" className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {availability.periodDays}-day feed availability
        </h3>
        <strong className="shrink-0 text-sm text-slate-900 dark:text-white">{percentage}</strong>
      </div>

      <div
        className="mt-2 grid h-7 gap-0.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, availability.buckets.length)}, minmax(0, 1fr))` }}
        role="img"
        aria-label={availabilitySummaryLabel(availability, sourceLabel)}
      >
        {availability.buckets.map((bucket) => (
          <span
            key={bucket.date}
            className={`min-w-0 rounded-[2px] ${availabilityBucketClass(bucket.status)}`}
            title={availabilityBucketTitle(bucket, sourceLabel)}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[9px] text-slate-400 dark:text-slate-500" aria-hidden="true">
        <span>{firstBucket ? formatBucketDate(firstBucket.date) : "30 days ago"}</span>
        <span>Today</span>
      </div>
      <div className="source-status-inset mt-2 rounded-md bg-white/70 px-2.5 py-2 dark:bg-black/10">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Observed by LineWatchTO
        </p>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
          <span>
            <strong className="text-slate-900 dark:text-white">{availability.totalChecks.toLocaleString()}</strong>{" "}
            {availability.totalChecks === 1 ? "feed check" : "feed checks"}
          </span>
          <span>
            <strong className="text-slate-900 dark:text-white">{formatPercentage(availability.monitoringCoveragePercentage)}%</strong>{" "}
            coverage
          </span>
        </div>
      </div>

      <div className="source-status-inset mt-2 rounded-md bg-white/70 px-2.5 py-2 dark:bg-black/10">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          API {sourceEndpoints.length === 1 ? "endpoint" : "endpoints"}
        </p>
        {endpointGroup ? (
          <div className="mt-1.5">
            <code className="block text-[10px] font-semibold leading-snug text-blue-700 dark:text-blue-300">
              {endpointGroup.base}
            </code>
            <div className="mt-2 flex flex-col gap-2">
              {endpointGroup.endpoints.map((endpoint) => (
                <div key={endpoint.fullUrl}>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {endpoint.label}
                  </span>
                  <code
                    className="mt-0.5 block break-words text-[10px] font-semibold leading-snug text-blue-700 dark:text-blue-300"
                    title={endpoint.fullUrl}
                  >
                    {endpoint.path}
                  </code>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <code className="mt-1 block text-[10px] font-semibold leading-snug text-slate-500 dark:text-slate-400">
            Configured backend endpoints withheld
          </code>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium text-slate-600 dark:text-slate-300" aria-label="Availability chart legend">
        <AvailabilityLegendItem colorClass="bg-emerald-500" label="Available" />
        <AvailabilityLegendItem colorClass="bg-amber-400" label="Intermittent" />
        <AvailabilityLegendItem colorClass="bg-red-500" label="Unavailable" />
        <AvailabilityLegendItem colorClass="bg-slate-300 dark:bg-slate-700" label="Unmonitored" />
      </div>

      <p className="source-status-note mt-2 rounded-md bg-blue-500/5 px-2.5 py-1.5 text-[10px] font-medium leading-snug text-slate-500 dark:text-slate-400">
        {note}
      </p>
    </section>
  );
}

function AvailabilityLegendItem({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-sm ${colorClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function availabilityBucketClass(status: FeedAvailabilityDay["status"]) {
  if (status === "up") return "bg-emerald-500";
  if (status === "degraded") return "bg-amber-400";
  if (status === "down") return "bg-red-500";
  return "bg-slate-300 dark:bg-slate-700";
}

function availabilityBucketTitle(bucket: FeedAvailabilityDay, sourceLabel: string) {
  const date = formatBucketDate(bucket.date, true);
  if (bucket.status === "unknown") return `${date}: insufficient monitoring coverage`;
  return `${date}: ${bucket.successfulChecks.toLocaleString()} successful, ${bucket.failedChecks.toLocaleString()} failed ${sourceLabel} checks`;
}

function availabilitySummaryLabel(availability: FeedAvailability, sourceLabel: string) {
  if (availability.availabilityPercentage === null) {
    return `${sourceLabel} availability has not collected enough observations over ${availability.periodDays} days.`;
  }
  return `${sourceLabel} observed availability was ${formatPercentage(availability.availabilityPercentage)} percent across ${availability.totalChecks.toLocaleString()} checks, with ${formatPercentage(availability.monitoringCoveragePercentage)} percent monitoring coverage.`;
}

function formatPercentage(value: number) {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatBucketDate(value: string, includeYear = false) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(year, month - 1, day, 12));
}

function formatApiEndpointGroup(
  endpoints: string[],
  labels: string[],
  sharedPathSegments: number,
) {
  if (endpoints.length === 0) return null;
  try {
    const urls = endpoints.map((endpoint) => new URL(endpoint));
    const origin = urls[0].origin;
    if (!urls.every((url) => url.protocol === "https:" && url.origin === origin)) return null;
    const baseSegments = urls[0].pathname.split("/").filter(Boolean).slice(0, sharedPathSegments);
    if (!urls.every((url) => baseSegments.every((segment, index) => (
      url.pathname.split("/").filter(Boolean)[index] === segment
    )))) return null;
    const sharedPath = baseSegments.length > 0 ? `/${baseSegments.join("/")}/` : "";
    return {
      base: `${urls[0].host}${sharedPath}`,
      endpoints: urls.map((url, index) => {
        const pathSegments = url.pathname.split("/").filter(Boolean).slice(baseSegments.length);
        return {
          label: labels[index] ?? `Endpoint ${index + 1}`,
          path: `/${pathSegments.join("/")}`,
          fullUrl: url.toString(),
        };
      }),
    };
  } catch {
    return null;
  }
}

function TtcCoverage({ health }: { health: TtcIngestionHealth }) {
  return (
    <section className="source-status-card rounded-lg bg-slate-50 p-3 dark:bg-white/5">
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Processing summary</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="Records received" value={health.recordsFetched} />
        <Metric label="Records retained" value={health.recordsStaged} />
        <Metric label="Rider summaries" value={health.recordsNormalized} />
        <Metric label="Not mapped" value={health.recordsUnmatched} />
      </div>
    </section>
  );
}

function RegionalCoverage({
  health,
  schedule,
}: {
  health: RegionalIngestionHealth;
  schedule: RegionalScheduleHealth | null;
}) {
  return (
    <section className="source-status-card rounded-lg bg-slate-50 p-3 dark:bg-white/5" data-regional-data-coverage>
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Collection coverage</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        {health.collections.map((collection) => (
          <div key={collection.sourceSystem} className="source-status-inset grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded bg-white/70 px-2.5 py-2 text-[11px] dark:bg-black/10">
            <div className="min-w-0">
              <strong className="block truncate text-slate-800 dark:text-slate-100">{collection.label}</strong>
              <span className="text-slate-500 dark:text-slate-400">
                {collection.kind === "operational" ? "Trip-level processing" : collection.required ? "Required rider source" : "Supplemental rider source"}
                {collection.sourceUpdatedAt ? ` · ${formatImpactTimestamp(collection.sourceUpdatedAt)}` : ""}
              </span>
            </div>
            <div className="text-right">
              <strong className={collection.status === "complete" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                {collection.status.replaceAll("-", " ")}
              </strong>
              <span className="block text-slate-500 dark:text-slate-400">{collection.recordsFetched} records</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="Records received" value={health.recordsFetched} />
        <Metric label="Rider summaries" value={health.recordsNormalized} />
      </div>
      <div className="source-status-inset mt-2 rounded bg-white/70 px-2.5 py-2 text-[11px] dark:bg-black/10">
        <strong className="text-slate-800 dark:text-slate-100">Published schedule coverage</strong>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
          {schedule
            ? schedule.scheduleActive && schedule.lookaheadCovered
              ? `Active across ${schedule.mappedStationLines} station-corridor pairs through ${schedule.requiredThrough}.`
              : `Coverage is ${schedule.status}; required through ${schedule.requiredThrough}.`
            : "Schedule lookahead health is unavailable."}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="source-status-inset rounded bg-white/70 px-2.5 py-2 dark:bg-black/10">
      <strong className="block text-sm text-slate-800 dark:text-slate-100">{value}</strong>
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
