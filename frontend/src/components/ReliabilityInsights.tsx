"use client";

import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  DAY_OF_WEEK_LABELS,
  defaultSeriesGranularity,
  formatHourLabel,
  formatHourOfWeek,
  formatMinutes,
  formatPercentage,
  intensityLevel,
  type AnalyticsHotspotsResponse,
  type AnalyticsNetworkId,
  type AnalyticsPatternsResponse,
  type AnalyticsSeriesResponse,
} from "../app/reliability-analytics";
import { formatServiceDate, formatServiceDateRange, serviceDayCount } from "../app/reliability-range";
import { useAnalyticsResource } from "../hooks/useAnalyticsResource";
import { ClassIcon, StatIcon } from "./analytics/AnalyticsIcons";
import { TransitLineBadge } from "./TransitLineBadge";

type InsightView = "trend" | "when" | "where" | "kinds";
const VIEWS: { id: InsightView; label: string }[] = [
  { id: "trend", label: "Trend" },
  { id: "when", label: "When" },
  { id: "where", label: "Where" },
  { id: "kinds", label: "Type" },
];
const HOTSPOT_LIMIT = 5;

/** One tab stop for a whole chart: arrow keys move the marked item, pointers mark what they touch. */
function useChartCursor(count: number, rowLength: number) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active !== null && active < count ? active : null;
  function onKeyDown(event: KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -rowLength, ArrowDown: rowLength,
    };
    const step = steps[event.key];
    if (step === undefined || count === 0) return;
    event.preventDefault();
    const next = shown === null ? (step > 0 ? 0 : count - 1) : shown + step;
    if (next >= 0 && next < count) setActive(next);
  }
  return { active: shown, setActive, onKeyDown, clear: () => setActive(null) };
}

function ChartBody({ loading, error, onRetry, empty, emptyMessage, children }: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  if (error) {
    return (
      <div className="reliability-insight-message" role="status">
        <span>{error}</span>
        <button type="button" onClick={onRetry}>Try Again</button>
      </div>
    );
  }
  if (loading) return <div className="reliability-insight-loading" role="status" aria-label="Loading" />;
  if (empty) return <div className="reliability-insight-message">{emptyMessage}</div>;
  return <>{children}</>;
}

function Trend({ networkId, from, to }: { networkId: AnalyticsNetworkId; from: string; to: string }) {
  const granularity = defaultSeriesGranularity(serviceDayCount(from, to));
  const params = new URLSearchParams({ network: networkId, from, to, granularity });
  const resource = useAnalyticsResource<AnalyticsSeriesResponse>(`/api/reliability/series?${params}`, true, null, false);
  const buckets = (resource.data?.buckets ?? []).map((bucket) => {
    const share = (id: string) => bucket.classes.find((item) => item.disruptionClass === id)?.weightedSharePercentage ?? 0;
    const gap = bucket.analyzableDays === 0 || bucket.weightedMinutes === null;
    return {
      bucket,
      gap,
      shares: gap ? [] : [
        { tone: "stopped", value: share("service-stopped") },
        { tone: "delay", value: share("delay") },
        { tone: "slow", value: share("slow-zone") },
      ],
    };
  });
  const peak = Math.max(0, ...buckets.map(({ shares }) => shares.reduce((sum, item) => sum + item.value, 0)));
  const cursor = useChartCursor(buckets.length, 1);
  const marked = cursor.active === null ? null : buckets[cursor.active];
  const readout = marked
    ? `${formatServiceDateRange(marked.bucket.from, marked.bucket.to, false)}${marked.bucket.includesToday ? " (Today So Far)" : ""}: ${
      marked.gap
        ? "coverage gap, not counted as clear"
        : `${marked.shares.filter((item) => item.value > 0 || item.tone !== "slow").map((item) => `${
          { stopped: "Stopped", delay: "Delays", slow: "Slow Zones" }[item.tone]} ${formatPercentage(item.value)}`).join(", ")} · ${
          marked.bucket.incidents ?? 0} incidents`}`
    : null;
  const slowZones = buckets.some(({ shares }) => shares.some((item) => item.tone === "slow" && item.value > 0));
  const first = buckets[0]?.bucket;

  return (
    <ChartBody
      loading={resource.loading}
      error={resource.error?.message ?? null}
      onRetry={resource.retry}
      empty={buckets.length === 0}
      emptyMessage="No days are recorded for this range yet."
    >
      <div
        className="reliability-trend"
        role="group"
        tabIndex={0}
        aria-label={`Disruption trend by ${granularity}. Use the arrow keys to read each bar.`}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.clear}
        onPointerLeave={cursor.clear}
      >
        <span className="reliability-trend-peak" aria-hidden="true">Scale to {formatPercentage(peak)}, station-weighted</span>
        {buckets.map(({ bucket, gap, shares }, index) => (
          <span
            key={bucket.from}
            className="reliability-trend-bar"
            data-gap={gap || undefined}
            data-today={bucket.includesToday || undefined}
            data-active={cursor.active === index || undefined}
            onPointerEnter={() => cursor.setActive(index)}
            onPointerDown={() => cursor.setActive(index)}
          >
            {shares.map((item) => item.value > 0 && peak > 0 ? (
              <span key={item.tone} data-tone={item.tone} style={{ height: `${(item.value / peak) * 100}%` }} />
            ) : null)}
          </span>
        ))}
      </div>
      <div className="reliability-chart-axis" aria-hidden="true">
        <span>{first ? formatServiceDate(first.from, false) : ""}</span>
        <span>{buckets.at(-1)?.bucket.includesToday ? "Today" : formatServiceDate(to, false)}</span>
      </div>
      <p className="reliability-chart-readout" aria-live="polite">
        {readout ?? (
          <span className="reliability-legend">
            <span><ClassIcon id="service-stopped" size={13} />Stopped</span>
            <span><ClassIcon id="delay" size={13} />Delays</span>
            {slowZones ? <span><ClassIcon id="slow-zone" size={13} />Slow Zones</span> : null}
            <span><i data-gap="true" />Coverage Gap</span>
          </span>
        )}
      </p>
    </ChartBody>
  );
}

function When({ networkId, from, to }: { networkId: AnalyticsNetworkId; from: string; to: string }) {
  const params = new URLSearchParams({ network: networkId, from, to });
  const resource = useAnalyticsResource<AnalyticsPatternsResponse>(`/api/reliability/patterns?${params}`, true, null, false);
  const ttc = networkId === "ttc";
  const measure = ttc ? "Service stopped" : "Any alert";
  const byHour = new Map((resource.data?.cells ?? []).map((cell) => [`${cell.dayOfWeek}-${cell.hour}`, cell]));
  const cells = Array.from({ length: 7 * 24 }, (_, index) => {
    const dayOfWeek = Math.floor(index / 24) + 1;
    const hour = index % 24;
    const cell = byHour.get(`${dayOfWeek}-${hour}`);
    const observed = cell?.observedMinutes ?? 0;
    // TTC slow zones run all day and would hide every other pattern. Classes can overlap, so none are added.
    const minutes = (ttc ? cell?.classMinutes?.["service-stopped"] : cell?.anyAlertMinutes) ?? 0;
    return { dayOfWeek, hour, observed, share: observed > 0 ? Math.min(100, (minutes / observed) * 100) : 0 };
  });
  const peak = Math.max(0, ...cells.map((cell) => cell.share));
  const cursor = useChartCursor(cells.length, 24);
  const marked = cursor.active === null ? null : cells[cursor.active];

  return (
    <ChartBody
      loading={resource.loading}
      error={resource.error?.message ?? null}
      onRetry={resource.retry}
      empty={cells.every((cell) => cell.observed <= 0)}
      emptyMessage="No hours are recorded for this range yet."
    >
      <div
        className="reliability-heat"
        role="group"
        tabIndex={0}
        aria-label={`${measure} by hour of the week. Use the arrow keys to read each hour.`}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.clear}
        onPointerLeave={cursor.clear}
      >
        {DAY_OF_WEEK_LABELS.map((day, row) => (
          <span key={day} className="reliability-heat-day" style={{ gridRow: row + 1 }} aria-hidden="true">{day}</span>
        ))}
        {cells.map((cell, index) => (
          <span
            key={index}
            className="reliability-heat-cell"
            style={{ gridRow: cell.dayOfWeek, gridColumn: cell.hour + 2 }}
            data-level={cell.observed > 0 ? intensityLevel(cell.share, peak) : "none"}
            data-active={cursor.active === index || undefined}
            onPointerEnter={() => cursor.setActive(index)}
            onPointerDown={() => cursor.setActive(index)}
          />
        ))}
      </div>
      <div className="reliability-chart-axis reliability-chart-axis--hours" aria-hidden="true">
        {[0, 6, 12, 18].map((hour) => <span key={hour}>{formatHourLabel(hour)}</span>)}
      </div>
      <p className="reliability-chart-readout" aria-live="polite">
        {marked
          ? `${formatHourOfWeek(marked.dayOfWeek, marked.hour)}: ${marked.observed > 0
            ? `${measure.toLowerCase()} for ${formatPercentage(marked.share)} of observed service`
            : "no observed service"}`
          : `${measure} by Toronto hour. A stronger colour is a larger share.`}
      </p>
    </ChartBody>
  );
}

function Where({ networkId, from, to }: { networkId: AnalyticsNetworkId; from: string; to: string }) {
  const params = new URLSearchParams({ network: networkId, from, to, sort: "minutes", limit: String(HOTSPOT_LIMIT) });
  // TTC slow zones would fill the list, as on the analytics page.
  if (networkId === "ttc") params.set("class", "service-stopped");
  const resource = useAnalyticsResource<AnalyticsHotspotsResponse>(`/api/reliability/hotspots?${params}`, true, null, false);
  const stations = resource.data?.stations ?? [];
  const most = Math.max(1, ...stations.map((station) => station.weightedMinutes));

  return (
    <ChartBody
      loading={resource.loading}
      error={resource.error?.message ?? null}
      onRetry={resource.retry}
      empty={stations.length === 0}
      emptyMessage="No station was named in a counted alert in this range."
    >
      <ol className="reliability-hotspots">
        {stations.map((station) => (
          <li key={`${station.lineId}-${station.stationId}`}>
            <TransitLineBadge lineId={station.lineId} lineNumber={station.lineNumber ?? undefined} size={18} decorative />
            <span>{station.stationName}</span>
            <strong>{formatMinutes(Math.round(station.weightedMinutes))}</strong>
            <span className="reliability-track" aria-hidden="true">
              <span
                data-tone={networkId === "ttc" ? "stopped" : "accent"}
                style={{ "--reliability-share": `${(station.weightedMinutes / most) * 100}%` } as CSSProperties}
              />
            </span>
          </li>
        ))}
      </ol>
      <p className="reliability-chart-readout">
        {networkId === "ttc" ? "Stations with the most service-stopped time." : "Stations with the most affected time."}
      </p>
    </ChartBody>
  );
}

/** The analytics pages' charts at sidebar size. Each view is read only when it is opened. */
export function ReliabilityInsights({ networkId, from, to, kinds, unavailable, onRetry }: {
  networkId: AnalyticsNetworkId;
  /** The dates to read, or null until they are known. */
  from: string | null;
  to: string | null;
  kinds: ReactNode;
  /** Why the dates are unknown, once that is certain. */
  unavailable: string | null;
  /** Set when trying again could help. */
  onRetry: (() => void) | null;
}) {
  const [view, setView] = useState<InsightView>("trend");
  return (
    <div className="reliability-insights">
      <div className="reliability-segments" role="group" aria-label="Chart">
        {VIEWS.map((option) => (
          <button key={option.id} type="button" aria-pressed={view === option.id} onClick={() => setView(option.id)}>
            <StatIcon id={option.id === "kinds" ? "breakdown" : option.id} size={14} />
            {option.label}
          </button>
        ))}
      </div>
      <div className="reliability-insight" data-view={view}>
        {view === "kinds" ? kinds
          : !from || !to ? (
            unavailable
              ? (
                <div className="reliability-insight-message" role="status">
                  <span>{unavailable}</span>
                  {onRetry ? <button type="button" onClick={onRetry}>Try Again</button> : null}
                </div>
              )
              : <div className="reliability-insight-loading" role="status" aria-label="Loading" />
          )
            : view === "trend" ? <Trend networkId={networkId} from={from} to={to} />
              : view === "when" ? <When networkId={networkId} from={from} to={to} />
                : <Where networkId={networkId} from={from} to={to} />}
      </div>
    </div>
  );
}
