"use client";

import { Accessibility, Bus, Gauge, TramFront, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  defaultSeriesGranularity,
  formatMinutes,
  formatPercentage,
  granularityAllowed,
  type AnalyticsGranularity,
  type AnalyticsOnTimeResponse,
  type AnalyticsTtcDelayLogResponse,
  type AnalyticsTtcPerformanceHistoryResponse,
} from "../../app/reliability-analytics";
import {
  formatServiceDate,
  formatServiceDateRange,
  serviceDayCount,
  type AnalyticsLineOption,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { useAnalyticsResource } from "../../hooks/useAnalyticsResource";
import { TransitLineBadge } from "../TransitLineBadge";
import { ChartDataTable, ChartFrame, useInView } from "./ChartFrame";
import { StackedBarChart, type StackedBarItem } from "./StackedBarChart";
import styles from "./analytics.module.css";

const OFFICIAL_ICONS: Record<string, LucideIcon> = {
  bus: Bus,
  streetcar: TramFront,
  "wheel-trans": Accessibility,
};

function OfficialMetricIcon({ metricKey }: { metricKey: string }) {
  if (metricKey.startsWith("line-")) return <TransitLineBadge lineId={metricKey} size={20} decorative />;
  if (metricKey === "elevators" || metricKey === "escalators") {
    return <Image src={`/assets/linewatch/outages/${metricKey === "elevators" ? "elevator" : "escalator"}.svg`} alt="" width={20} height={20} />;
  }
  const Icon = OFFICIAL_ICONS[metricKey] ?? Gauge;
  return <Icon size={18} aria-hidden="true" />;
}

type DemoModule = typeof import("../../app/reliability-analytics-fixture");

function shortDate(date: string, granularity: AnalyticsGranularity): string {
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(new Date(`${date}T00:00:00Z`)).replace(/\./g, "");
  }
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`)).replace(/\./g, "");
}

export function OnTimePerformanceModule({
  lines,
  query,
  range,
  demo,
  demoModule,
}: {
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  demo: boolean;
  demoModule: DemoModule | null;
}) {
  const [sectionRef, seen] = useInView(false);
  const [active, setActive] = useState<StackedBarItem | null>(null);
  const days = range.from && range.to ? serviceDayCount(range.from, range.to) : 0;
  const granularity: AnalyticsGranularity = granularityAllowed(days, "day") ? "day" : defaultSeriesGranularity(days);

  const path = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ from: range.from, to: range.to, granularity });
    if (query.line) params.set("line", query.line);
    return `/api/reliability/on-time?${params.toString()}`;
  }, [range.from, range.to, granularity, query.line]);

  const demoData = useMemo<AnalyticsOnTimeResponse | null>(
    () => demo && demoModule ? demoModule.demoOnTime(lines, query, range, granularity) : null,
    [demo, demoModule, lines, query, range, granularity],
  );

  const resource = useAnalyticsResource<AnalyticsOnTimeResponse>(path, seen, demoData, demo);
  const data = resource.data;
  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const hasObservations = (data?.totals.observedTrips ?? 0) > 0;

  const items = useMemo<StackedBarItem[]>(() => buckets.map((b) => {
    const label = formatServiceDateRange(b.from, b.to);
    const shortLabel = shortDate(b.from, granularity);
    const evaluated = b.terminalObservedTrips + b.cancelledTrips;
    if (b.observedTrips === 0 || evaluated === 0) {
      return {
        id: b.from,
        label,
        shortLabel,
        total: null,
        segments: [],
        ariaLabel: `${label}: No evaluated trip arrivals. Unobserved trips are not counted on time.`,
        tooltip: <span><strong>{label}</strong> — No evaluated terminal arrivals ({b.scheduledTrips} scheduled).</span>,
      };
    }
    return {
      id: b.from,
      label,
      shortLabel,
      total: evaluated,
      segments: [
        ...(b.onTimeTrips > 0 ? [{ key: "on-time", label: "On Time", value: b.onTimeTrips, tone: "corridor-a" as const, pattern: "solid" as const }] : []),
        ...(b.lateTrips > 0 ? [{ key: "late", label: "Late (> 5 min)", value: b.lateTrips, tone: "delay" as const, pattern: "stripe" as const }] : []),
        ...(b.cancelledTrips > 0 ? [{ key: "cancelled", label: "Cancelled", value: b.cancelledTrips, tone: "stopped" as const, pattern: "dots" as const }] : []),
      ],
      partial: b.coveragePercentage < 80,
      ariaLabel: `${label}: ${b.onTimePercentage ?? 0}% on time (${b.onTimeTrips} on time, ${b.lateTrips} late, ${b.cancelledTrips} cancelled; ${b.coveragePercentage}% coverage).`,
      tooltip: (
        <span>
          <strong>{label}</strong> — {b.onTimePercentage !== null ? `${formatPercentage(b.onTimePercentage)} on time` : "No terminal readings"} · {b.onTimeTrips} on time, {b.lateTrips} late, {b.cancelledTrips} cancelled ({formatPercentage(b.coveragePercentage)} of {b.scheduledTrips} scheduled observed)
        </span>
      ),
    };
  }), [buckets, granularity]);

  const table = (
    <ChartDataTable
      caption="GO and UP On-Time Performance by Corridor"
      columns={[
        { key: "corridor", label: "Corridor", align: "left" },
        { key: "otp", label: "On Time" },
        { key: "coverage", label: "Trips Observed" },
        { key: "late", label: "Late" },
        { key: "cancelled", label: "Cancelled" },
      ]}
      rows={(data?.corridors ?? []).map((c) => ({
        id: c.lineId,
        cells: {
          corridor: c.label,
          otp: c.onTimePercentage !== null ? formatPercentage(c.onTimePercentage) : "—",
          coverage: `${c.observedTrips.toLocaleString("en-CA")} / ${c.scheduledTrips.toLocaleString("en-CA")} (${formatPercentage(c.coveragePercentage)})`,
          late: c.lateTrips.toLocaleString("en-CA"),
          cancelled: c.cancelledTrips.toLocaleString("en-CA"),
        },
      }))}
    />
  );

  return (
    <ChartFrame
      id="on-time-performance"
      sectionRef={sectionRef}
      title="GO & UP On-Time Performance"
      subtitle={data?.definition ?? "Metrolinx 5-minute final-destination arrival threshold from GTFS-RT TripUpdates; unobserved trips are unknown, never on time."}
      legend={(
        <ul className={styles.legendList}>
          <li><span className={styles.legendSwatch} data-tone="corridor-a" />On Time (≤ 5 min)</li>
          <li><span className={styles.legendSwatch} data-tone="delay" data-pattern="stripe" />Late (&gt; 5 min)</li>
          <li><span className={styles.legendSwatch} data-tone="stopped" data-pattern="dots" />Cancelled</li>
          <li><span className={styles.legendSwatch} data-tone="gap" />Unobserved</li>
        </ul>
      )}
      readout={active?.tooltip}
      defaultReadout={data && hasObservations
        ? `${data.totals.onTimePercentage !== null ? `${formatPercentage(data.totals.onTimePercentage)} on time` : "Tracking"} · ${data.totals.observedTrips.toLocaleString("en-CA")} of ${data.totals.scheduledTrips.toLocaleString("en-CA")} scheduled trips observed (${formatPercentage(data.totals.coveragePercentage)} coverage).`
        : data?.message ?? "Select a period to inspect evaluated trips."}
      table={data && (data.corridors.length > 0) ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && !hasObservations}
      emptyMessage={data?.message ?? "No GO/UP trip observations recorded in this range yet."}
    >
      <StackedBarChart
        accessibleName="GO and UP On-Time Performance Chart"
        items={items}
        unitLabel="trips"
        formatAxis={(v) => `${Math.round(v).toLocaleString("en-CA")}`}
        onActiveChange={setActive}
      />
    </ChartFrame>
  );
}

export function TtcDelayLogModule({
  query,
  range,
  demo,
  demoModule,
}: {
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  demo: boolean;
  demoModule: DemoModule | null;
}) {
  const [sectionRef, seen] = useInView(false);
  const [active, setActive] = useState<StackedBarItem | null>(null);
  const days = range.from && range.to ? serviceDayCount(range.from, range.to) : 0;
  const granularity: AnalyticsGranularity = granularityAllowed(days, "day") ? "day" : defaultSeriesGranularity(days);

  const path = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ from: range.from, to: range.to, granularity });
    if (query.line) params.set("line", query.line);
    return `/api/reliability/ttc-delay-log?${params.toString()}`;
  }, [range.from, range.to, granularity, query.line]);

  const demoData = useMemo<AnalyticsTtcDelayLogResponse | null>(
    () => demo && demoModule ? demoModule.demoTtcDelayLog(range, granularity) : null,
    [demo, demoModule, range, granularity],
  );

  const resource = useAnalyticsResource<AnalyticsTtcDelayLogResponse>(path, seen, demoData, demo);
  const data = resource.data;
  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const hasData = (data?.totals.incidents ?? 0) > 0;

  const items = useMemo<StackedBarItem[]>(() => buckets.map((b) => {
    const label = formatServiceDateRange(b.from, b.to);
    const shortLabel = shortDate(b.from, granularity);
    return {
      id: b.from,
      label,
      shortLabel,
      total: b.delayMinutes,
      segments: b.delayMinutes > 0
        ? [{ key: "delay-log", label: "Official Delay Minutes", value: b.delayMinutes, tone: "delay" as const, pattern: "stripe" as const }]
        : [],
      ariaLabel: `${label}: ${b.incidents} official delay incidents, ${b.delayMinutes} delay minutes.`,
      tooltip: (
        <span>
          <strong>{label}</strong> — {b.incidents.toLocaleString("en-CA")} official incidents · {formatMinutes(b.delayMinutes)} logged delay
        </span>
      ),
    };
  }), [buckets, granularity]);

  const periodText = data?.publicationPeriod?.from && data.publicationPeriod.to
    ? `Published ${formatServiceDate(data.publicationPeriod.from)} to ${formatServiceDate(data.publicationPeriod.to)} · ${data.licence}. Shown separately from LineWatchTO-observed minutes.`
    : "Open Data Toronto TTC Subway Delay Data (Open Government Licence – Toronto), shown separately from LineWatchTO-observed minutes.";

  const table = (
    <ChartDataTable
      caption="TTC Official Delay Log by Top Codes"
      columns={[
        { key: "code", label: "Code", align: "left" },
        { key: "desc", label: "Description", align: "left" },
        { key: "incidents", label: "Incidents" },
        { key: "minutes", label: "Delay Minutes" },
      ]}
      rows={(data?.topCodes ?? []).map((c) => ({
        id: c.code,
        cells: {
          code: c.code,
          desc: c.description,
          incidents: c.incidents.toLocaleString("en-CA"),
          minutes: c.delayMinutes.toLocaleString("en-CA"),
        },
      }))}
    />
  );

  return (
    <ChartFrame
      id="ttc-delay-log"
      sectionRef={sectionRef}
      title="TTC Delay Log"
      subtitle={periodText}
      legend={(
        <ul className={styles.legendList}>
          <li><span className={styles.legendSwatch} data-tone="delay" data-pattern="stripe" />Official Logged Delay Minutes</li>
        </ul>
      )}
      readout={active?.tooltip}
      defaultReadout={data && hasData
        ? `${data.totals.incidents.toLocaleString("en-CA")} logged delay incidents · ${formatMinutes(data.totals.delayMinutes)} total${data.totals.medianDelayMinutes !== null ? ` · ${data.totals.medianDelayMinutes} min median` : ""}.`
        : data?.message ?? "Official TTC subway delay incidents from Open Data Toronto."}
      table={data && data.topCodes.length > 0 ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && !hasData}
      emptyMessage={data?.message ?? "No official TTC delay log entries available for this range."}
    >
      <StackedBarChart
        accessibleName="TTC Official Delay Log Chart"
        items={items}
        unitLabel="min"
        formatAxis={(v) => formatMinutes(Math.round(v))}
        onActiveChange={setActive}
      />
    </ChartFrame>
  );
}

export function TtcPerformanceHistoryModule({
  range,
  demo,
  demoModule,
}: {
  range: ResolvedAnalyticsRange;
  demo: boolean;
  demoModule: DemoModule | null;
}) {
  const [sectionRef, seen] = useInView(false);
  const path = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ from: range.from, to: range.to });
    return `/api/reliability/ttc-performance?${params.toString()}`;
  }, [range.from, range.to]);

  const demoData = useMemo<AnalyticsTtcPerformanceHistoryResponse | null>(
    () => demo && demoModule ? demoModule.demoTtcPerformanceHistory(range) : null,
    [demo, demoModule, range],
  );

  const resource = useAnalyticsResource<AnalyticsTtcPerformanceHistoryResponse>(path, seen, demoData, demo);
  const data = resource.data;
  // Lines, then surface routes, then accessibility, as in the dashboard panel.
  const order = (key: string) => key.startsWith("line-") ? 0 : key === "elevators" || key === "escalators" ? 2 : 1;
  const metrics = [...data?.metrics ?? []].sort((a, b) => order(a.metricKey) - order(b.metricKey));

  const table = (
    <ChartDataTable
      caption="Official TTC.ca Daily Performance Readings"
      columns={[
        { key: "metric", label: "Metric", align: "left" },
        { key: "latest", label: "Latest Reading" },
        { key: "target", label: "Target" },
        { key: "readings", label: "Stored Days" },
      ]}
      rows={metrics.map((m) => {
        const latest = m.points[m.points.length - 1];
        return {
          id: m.metricKey,
          cells: {
            metric: m.label,
            latest: latest?.valueLabel ?? (latest?.percentage !== null && latest?.percentage !== undefined ? `${latest.percentage}%` : "—"),
            target: m.target !== null ? `${m.target}%` : "—",
            readings: m.points.length.toLocaleString("en-CA"),
          },
        };
      })}
    />
  );

  return (
    <ChartFrame
      id="ttc-performance-history"
      sectionRef={sectionRef}
      title="Official TTC Performance History"
      subtitle="Stored TTC.ca Daily Customer Service Report readings over this range; separate from LineWatchTO-observed disruptions."
      readout={null}
      table={metrics.length > 0 ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && metrics.length === 0}
      emptyMessage={data?.message ?? "No stored TTC.ca performance readings recorded in this range yet."}
    >
      <ul className={styles.metricTiles}>
        {metrics.map((metric) => {
          const latest = metric.points.at(-1);
          const value = latest?.percentage ?? null;
          return (
            <li key={metric.metricKey}>
              <span className={styles.metricTileName}><OfficialMetricIcon metricKey={metric.metricKey} /><span className={styles.metricTileText}>{metric.label}</span></span>
              <strong>{latest?.valueLabel ?? (value !== null ? `${value}%` : "—")}</strong>
              <span className={styles.metricTrack} aria-hidden="true">
                {value !== null ? <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /> : null}
                {metric.target !== null ? <i style={{ left: `${metric.target}%` }} /> : null}
              </span>
              <small>
                {metric.target !== null ? `Target ${metric.target}% · ` : ""}
                {metric.points.length.toLocaleString("en-CA")} {metric.points.length === 1 ? "Day" : "Days"} Stored
              </small>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
