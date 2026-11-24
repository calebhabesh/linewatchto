"use client";

import { useMemo, useState } from "react";
import {
  classMetric,
  defaultSeriesGranularity,
  formatHours,
  formatMinutes,
  formatPercentage,
  granularityAllowed,
  type AnalyticsAvailability,
  type AnalyticsGranularity,
  type AnalyticsNetworkId,
  type AnalyticsSeriesBucket,
  type AnalyticsSeriesResponse,
  type AnalyticsSummary,
} from "../../app/reliability-analytics";
import {
  formatServiceDateRange,
  serviceDayCount,
  type AnalyticsDrilldown,
  type AnalyticsLineOption,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { useAnalyticsResource } from "../../hooks/useAnalyticsResource";
import { ChartDataTable, ChartFrame, useInView } from "./ChartFrame";
import { HistogramChart, type HistogramSelection } from "./HistogramChart";
import { RankedBarChart, type RankedBarItem } from "./RankedBarChart";
import { StackedBarChart, type StackedBarItem, type StackedBarSegment } from "./StackedBarChart";
import styles from "./analytics.module.css";

const GRANULARITIES: Array<{ value: AnalyticsGranularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type DemoModule = typeof import("../../app/reliability-analytics-fixture");

function shortBucketLabel(bucket: AnalyticsSeriesBucket, granularity: AnalyticsGranularity): string {
  const from = bucket.from;
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(new Date(`${from}T00:00:00Z`)).replace(/\./g, "");
  }
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${from}T00:00:00Z`)).replace(/\./g, "");
}

export function TrendModule({
  networkId,
  lines,
  query,
  range,
  availability,
  showSlowZones,
  demo,
  demoModule,
  onDrilldown,
}: {
  networkId: AnalyticsNetworkId;
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
  showSlowZones: boolean;
  demo: boolean;
  demoModule: DemoModule | null;
  onDrilldown: (patch: Partial<AnalyticsDrilldown>) => void;
}) {
  const [sectionRef, seen] = useInView(true);
  const days = range.from && range.to ? serviceDayCount(range.from, range.to) : 0;
  const [chosenGranularity, setChosenGranularity] = useState<AnalyticsGranularity | null>(null);
  const granularity: AnalyticsGranularity = chosenGranularity && granularityAllowed(days, chosenGranularity)
    ? chosenGranularity
    : defaultSeriesGranularity(days);
  const [metric, setMetric] = useState<"minutes" | "share">("minutes");
  const [active, setActive] = useState<StackedBarItem | null>(null);

  const path = (() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ network: networkId, from: range.from, to: range.to, granularity });
    if (query.line) params.set("line", query.line);
    if (query.line && query.station) params.set("station", query.station);
    return `/api/reliability/series?${params.toString()}`;
  })();

  const demoData: AnalyticsSeriesResponse | null = demo && demoModule
    ? demoModule.demoSeries(networkId, lines, query, range, availability, granularity, false)
    : null;

  const resource = useAnalyticsResource<AnalyticsSeriesResponse>(path, seen, demoData, demo);
  const buckets = resource.data?.buckets ?? [];

  const items: StackedBarItem[] = buckets.map((bucket) => {
    const label = formatServiceDateRange(bucket.from, bucket.to);
    const shortLabel = shortBucketLabel(bucket, granularity);
    const isGap = bucket.analyzableDays === 0 || bucket.weightedMinutes === null;
    if (isGap) {
      return {
        id: bucket.from,
        label,
        shortLabel,
        total: null,
        segments: [],
        today: bucket.includesToday,
        partial: false,
        ariaLabel: `${label}: Coverage gap, no analyzable day.`,
        tooltip: (
          <span>
            <strong>{label}</strong> — Coverage gap ({bucket.pollingPercentage.toFixed(1)}% polling, {bucket.schedulePercentage.toFixed(1)}% schedule). Not counted as zero disruption.
          </span>
        ),
      };
    }

    const stopped = bucket.classes.find((c) => c.disruptionClass === "service-stopped");
    const delay = bucket.classes.find((c) => c.disruptionClass === "delay");
    const slow = bucket.classes.find((c) => c.disruptionClass === "slow-zone");
    const pick = (c: typeof stopped) => metric === "minutes" ? (c?.weightedMinutes ?? 0) : (c?.weightedSharePercentage ?? 0);

    const segments: StackedBarSegment[] = [
      { key: "service-stopped", label: "Service Stopped", value: pick(stopped), tone: "stopped", pattern: "solid" },
      { key: "delay", label: "Delays", value: pick(delay), tone: "delay", pattern: "stripe" },
      ...(showSlowZones ? [{ key: "slow-zone", label: "Slow Zones", value: pick(slow), tone: "slow" as const, pattern: "dots" as const }] : []),
    ];
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const partial = bucket.pollingPercentage < 95 || bucket.schedulePercentage < 100;
    const todaySuffix = bucket.includesToday ? " (Today So Far)" : "";
    const summaryText = metric === "minutes"
      ? `${formatMinutes(Math.round(bucket.weightedMinutes ?? 0))} station-weighted · ${bucket.incidents ?? 0} incidents`
      : `${formatPercentage(bucket.weightedSharePercentage ?? 0)} weighted share · ${bucket.incidents ?? 0} incidents`;

    return {
      id: bucket.from,
      label,
      shortLabel,
      total,
      segments,
      today: bucket.includesToday,
      partial,
      ariaLabel: `${label}${todaySuffix}: ${summaryText}. Select to filter episodes.`,
      tooltip: (
        <span>
          <strong>{label}{todaySuffix}</strong> — {summaryText}
          {" · "}Stopped: {metric === "minutes" ? formatMinutes(Math.round(stopped?.weightedMinutes ?? 0)) : formatPercentage(stopped?.weightedSharePercentage ?? 0)},
          {" "}Delays: {metric === "minutes" ? formatMinutes(Math.round(delay?.weightedMinutes ?? 0)) : formatPercentage(delay?.weightedSharePercentage ?? 0)}
          {showSlowZones ? `, Slow Zones: ${metric === "minutes" ? formatMinutes(Math.round(slow?.weightedMinutes ?? 0)) : formatPercentage(slow?.weightedSharePercentage ?? 0)}` : ""}
          {" · "}Coverage {bucket.pollingPercentage.toFixed(0)}% polling
        </span>
      ),
    };
  });

  const bucketById = new Map(buckets.map((b) => [b.from, b]));

  const table = (
    <ChartDataTable
      caption="Disruption Trend Table"
      columns={[
        { key: "period", label: "Period", align: "left" },
        { key: "coverage", label: "Coverage" },
        { key: "stopped", label: "Service Stopped" },
        { key: "delay", label: "Delays" },
        ...(showSlowZones ? [{ key: "slow", label: "Slow Zones" }] : []),
        { key: "incidents", label: "Incidents" },
      ]}
      rows={buckets.map((bucket) => {
        const isGap = bucket.analyzableDays === 0 || bucket.weightedMinutes === null;
        const stopped = bucket.classes.find((c) => c.disruptionClass === "service-stopped");
        const delay = bucket.classes.find((c) => c.disruptionClass === "delay");
        const slow = bucket.classes.find((c) => c.disruptionClass === "slow-zone");
        const fmt = (c: typeof stopped) => isGap ? "Gap" : metric === "minutes"
          ? formatMinutes(Math.round(c?.weightedMinutes ?? 0))
          : formatPercentage(c?.weightedSharePercentage ?? 0);
        return {
          id: bucket.from,
          cells: {
            period: `${formatServiceDateRange(bucket.from, bucket.to)}${bucket.includesToday ? " (Today So Far)" : ""}`,
            coverage: isGap ? "Coverage Gap" : `${bucket.analyzableDays}/${bucket.days} d · ${bucket.pollingPercentage.toFixed(0)}%`,
            stopped: fmt(stopped),
            delay: fmt(delay),
            slow: fmt(slow),
            incidents: isGap ? "—" : (bucket.incidents ?? 0).toLocaleString("en-CA"),
          },
        };
      })}
    />
  );

  return (
    <ChartFrame
      id="trend"
      sectionRef={sectionRef}
      title="Disruption Trend"
      subtitle="Station-weighted disruption over time. Hatched columns mark coverage gaps, never zero disruption."
      controls={(
        <div className={styles.controlCluster}>
          <div className={styles.segmentedSmall} role="group" aria-label="Trend Granularity">
            {GRANULARITIES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={granularity === opt.value}
                disabled={!granularityAllowed(days, opt.value)}
                onClick={() => setChosenGranularity(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className={styles.segmentedSmall} role="group" aria-label="Trend Metric">
            <button type="button" aria-pressed={metric === "minutes"} onClick={() => setMetric("minutes")}>Minutes</button>
            <button type="button" aria-pressed={metric === "share"} onClick={() => setMetric("share")}>Share %</button>
          </div>
        </div>
      )}
      legend={(
        <ul className={styles.legendList}>
          <li><span className={styles.legendSwatch} data-tone="stopped" />Service Stopped</li>
          <li><span className={styles.legendSwatch} data-tone="delay" data-pattern="stripe" />Delays</li>
          {showSlowZones ? <li><span className={styles.legendSwatch} data-tone="slow" data-pattern="dots" />Slow Zones</li> : null}
          <li><span className={styles.legendSwatch} data-tone="gap" />Coverage Gap</li>
          <li><span className={styles.legendSwatch} data-tone="today" />Today So Far</li>
        </ul>
      )}
      readout={active?.tooltip}
      defaultReadout="Hover or focus any bar for class details; select an observed bar to filter episodes to that period."
      table={buckets.length ? table : undefined}
      loading={resource.loading}
      error={resource.error}
      onRetry={resource.retry}
      empty={!resource.loading && !resource.error && buckets.length === 0}
    >
      <StackedBarChart
        accessibleName={`Disruption trend by ${granularity}`}
        items={items}
        unitLabel={metric === "minutes" ? "Weighted Minutes" : "Weighted Share %"}
        formatAxis={(v) => metric === "minutes" ? (v >= 120 ? `${formatHours(v)} hr` : `${Math.round(v)} m`) : `${v.toFixed(0)}%`}
        onActiveChange={setActive}
        onSelect={(item) => {
          const bucket = bucketById.get(item.id);
          if (bucket) onDrilldown({ from: bucket.from, to: bucket.to });
        }}
      />
    </ChartFrame>
  );
}

export function BreakdownModule({
  networkId,
  summary,
  onDrilldown,
}: {
  networkId: AnalyticsNetworkId;
  summary: AnalyticsSummary | null;
  onDrilldown: (patch: Partial<AnalyticsDrilldown>) => void;
}) {
  const [tab, setTab] = useState<"kind" | "cause">("kind");
  const [active, setActive] = useState<RankedBarItem | null>(null);
  const ttc = networkId === "ttc";
  const effectiveTab = ttc ? tab : "kind";
  const kinds = useMemo(() => summary?.breakdown ?? [], [summary]);
  const causes = useMemo(() => summary?.causes ?? [], [summary]);

  const kindTone = (kind: string): RankedBarItem["tone"] => {
    if (kind === "suspension" || kind === "closure" || kind === "planned-closure") return "stopped";
    if (kind === "reduced-speed-zone") return "slow";
    return "delay";
  };

  const items = useMemo<RankedBarItem[]>(() => {
    if (effectiveTab === "cause") {
      return causes.map((item) => ({
        id: item.cause,
        label: item.label,
        value: item.incidentDisruptionMinutes,
        valueText: `${formatHours(item.incidentDisruptionMinutes)} hr`,
        detailText: `${item.incidents.toLocaleString("en-CA")} ${item.incidents === 1 ? "incident" : "incidents"} · ${formatPercentage(item.percentage)}`,
        tone: "accent",
        ariaLabel: `${item.label}: ${formatHours(item.incidentDisruptionMinutes)} incident-hours, ${item.incidents} incidents (${formatPercentage(item.percentage)}). Select to filter episodes.`,
        tooltip: (
          <span>
            <strong>{item.label}</strong> — {formatHours(item.incidentDisruptionMinutes)} additive incident-hours across {item.incidents.toLocaleString("en-CA")} incidents ({formatPercentage(item.percentage)}).
          </span>
        ),
      }));
    }
    return kinds.map((item) => ({
      id: item.impactKind,
      label: item.label,
      value: item.incidentDisruptionMinutes,
      valueText: `${formatHours(item.incidentDisruptionMinutes)} hr`,
      detailText: `${item.incidents.toLocaleString("en-CA")} ${item.incidents === 1 ? "incident" : "incidents"} · ${formatPercentage(item.percentage)}`,
      tone: kindTone(item.impactKind),
      ariaLabel: `${item.label}: ${formatHours(item.incidentDisruptionMinutes)} incident-hours, ${item.incidents} incidents (${formatPercentage(item.percentage)}). Select to filter episodes.`,
      tooltip: (
        <span>
          <strong>{item.label}</strong> — {formatHours(item.incidentDisruptionMinutes)} additive incident-hours across {item.incidents.toLocaleString("en-CA")} incidents ({formatPercentage(item.percentage)}).
        </span>
      ),
    }));
  }, [effectiveTab, kinds, causes]);

  const table = (
    <ChartDataTable
      caption={effectiveTab === "cause" ? "Breakdown by Cause Table" : "Breakdown by Kind Table"}
      columns={[
        { key: "name", label: effectiveTab === "cause" ? "Cause" : "Impact Kind", align: "left" },
        { key: "incidents", label: "Incidents" },
        { key: "hours", label: "Incident-Hours" },
        { key: "share", label: "Share" },
      ]}
      rows={items.map((item) => {
        const src = effectiveTab === "cause"
          ? causes.find((c) => c.cause === item.id)
          : kinds.find((k) => k.impactKind === item.id);
        return {
          id: item.id,
          cells: {
            name: item.label,
            incidents: (src?.incidents ?? 0).toLocaleString("en-CA"),
            hours: `${formatHours(src?.incidentDisruptionMinutes ?? 0)} hr`,
            share: formatPercentage(src?.percentage ?? 0),
          },
        };
      })}
    />
  );

  return (
    <ChartFrame
      id="breakdown"
      title="Breakdown"
      subtitle={effectiveTab === "cause"
        ? "TTC GTFS-RT reported causes by additive incident-hours. Select a bar to list matching episodes."
        : "Disruption types by additive incident-hours. Select a bar to list matching episodes."}
      controls={ttc ? (
        <div className={styles.segmentedSmall} role="group" aria-label="Breakdown Dimension">
          <button type="button" aria-pressed={effectiveTab === "kind"} onClick={() => { setTab("kind"); setActive(null); }}>By Kind</button>
          <button type="button" aria-pressed={effectiveTab === "cause"} onClick={() => { setTab("cause"); setActive(null); }}>By Cause</button>
        </div>
      ) : undefined}
      readout={active?.tooltip}
      defaultReadout="Select any row to filter the episode list to that disruption type or cause."
      table={items.length ? table : undefined}
      loading={!summary}
      empty={Boolean(summary) && items.length === 0}
      emptyMessage="No disruptions observed in this range."
    >
      <RankedBarChart
        accessibleName={effectiveTab === "cause" ? "Breakdown by cause" : "Breakdown by kind"}
        items={items}
        onActiveChange={setActive}
        onSelect={(item) => effectiveTab === "cause"
          ? onDrilldown({ cause: item.id, kind: null })
          : onDrilldown({ kind: item.id, cause: null })}
      />
    </ChartFrame>
  );
}

export function HowLongModule({
  summary,
  onDrilldown,
}: {
  summary: AnalyticsSummary | null;
  onDrilldown: (patch: Partial<AnalyticsDrilldown>) => void;
}) {
  const [active, setActive] = useState<HistogramSelection | null>(null);
  const durations = summary?.durations ?? null;
  const buckets = durations?.buckets ?? [];
  const hasCleared = (durations?.all.clearedCount ?? 0) > 0;

  const readout = active ? (
    <span>
      <strong>{active.bucket.label} · {active.planned ? "Planned" : "Unplanned"}</strong> —{" "}
      {(active.planned ? active.bucket.planned : active.bucket.unplanned).toLocaleString("en-CA")} cleared{" "}
      {(active.planned ? active.bucket.planned : active.bucket.unplanned) === 1 ? "episode" : "episodes"}.
      {" "}Select to inspect matching episodes.
    </span>
  ) : undefined;

  const table = (
    <ChartDataTable
      caption="Time to Clear Distribution Table"
      columns={[
        { key: "bin", label: "Duration", align: "left" },
        { key: "unplanned", label: "Unplanned" },
        { key: "planned", label: "Planned" },
        { key: "total", label: "Total" },
      ]}
      rows={buckets.map((b) => ({
        id: b.id,
        cells: {
          bin: b.label,
          unplanned: b.unplanned.toLocaleString("en-CA"),
          planned: b.planned.toLocaleString("en-CA"),
          total: b.total.toLocaleString("en-CA"),
        },
      }))}
    />
  );

  return (
    <ChartFrame
      id="how-long"
      title="How Long"
      subtitle="Time to clear for completed episodes, split into unplanned and planned disruptions."
      legend={durations ? (
        <div className={styles.durationStatsRow}>
          <ul className={styles.legendList}>
            <li><span className={styles.legendSwatch} data-tone="counted" />Unplanned ({durations.unplanned.clearedCount.toLocaleString("en-CA")})</li>
            <li><span className={styles.legendSwatch} data-tone="planned" />Planned ({durations.planned.clearedCount.toLocaleString("en-CA")})</li>
          </ul>
          <dl className={styles.inlineStats}>
            <div>
              <dt>Unplanned Median / P90</dt>
              <dd>{formatMinutes(durations.unplanned.medianMinutes)} / {formatMinutes(durations.unplanned.p90Minutes)}</dd>
            </div>
            <div>
              <dt>Planned Median / P90</dt>
              <dd>{formatMinutes(durations.planned.medianMinutes)} / {formatMinutes(durations.planned.p90Minutes)}</dd>
            </div>
          </dl>
        </div>
      ) : undefined}
      readout={readout}
      defaultReadout="Select any duration bar to filter cleared episodes in that time range."
      table={hasCleared ? table : undefined}
      loading={!summary}
      empty={Boolean(summary) && !hasCleared}
      emptyMessage="No cleared episodes with counted duration in this range."
    >
      <HistogramChart
        accessibleName="Time to clear histogram, unplanned and planned"
        buckets={buckets}
        medianMinutes={durations?.all.medianMinutes ?? null}
        p90Minutes={durations?.all.p90Minutes ?? null}
        onActiveChange={setActive}
        onSelect={({ bucket, planned }) => onDrilldown({
          planned,
          completed: true,
          minMinutes: bucket.minMinutes,
          maxMinutes: bucket.maxMinutes,
        })}
      />
    </ChartFrame>
  );
}

export function slowZoneDayCount(bucket: AnalyticsSeriesBucket): number {
  return classMetric({
    observedMinutes: bucket.observedMinutes,
    incidents: bucket.incidents ?? 0,
    activeIncidents: 0,
    medianTimeToClearMinutes: null,
    p90TimeToClearMinutes: null,
    uniqueMinutes: bucket.uniqueMinutes ?? 0,
    anyAlertPercentage: 0,
    incidentDisruptionMinutes: 0,
    weightedImpactMinutes: bucket.weightedMinutes ?? 0,
    weightedImpactPercentage: bucket.weightedSharePercentage ?? 0,
    classes: bucket.classes,
  }, "slow-zone")?.incidents ?? 0;
}
