"use client";

import { useMemo, useState } from "react";
import {
  buildEpisodesPath,
  calendarRange,
  CLASS_LABELS,
  confidenceLabel,
  defaultSeriesGranularity,
  formatHours,
  formatMinutes,
  formatPercentage,
  granularityAllowed,
  type AnalyticsAvailability,
  type AnalyticsCancellationsResponse,
  type AnalyticsEpisodesResponse,
  type AnalyticsGranularity,
  type AnalyticsNetworkId,
  type AnalyticsSeriesResponse,
  type DisruptionClassId,
} from "../../app/reliability-analytics";
import {
  emptyAnalyticsDrilldown,
  formatServiceDate,
  formatServiceDateRange,
  serviceDayCount,
  type AnalyticsDrilldown,
  type AnalyticsLineOption,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { useAnalyticsResource } from "../../hooks/useAnalyticsResource";
import { TransitLineBadge } from "../TransitLineBadge";
import { CalendarChart, calendarGridDates, type CalendarDayCell, type CalendarLineRow } from "./CalendarChart";
import { ChartDataTable, ChartFrame, useInView } from "./ChartFrame";
import { StackedBarChart, type StackedBarItem, type StackedBarSegment } from "./StackedBarChart";
import { slowZoneDayCount } from "./TrendAndBreakdownModules";
import styles from "./analytics.module.css";

type DemoModule = typeof import("../../app/reliability-analytics-fixture");
type CalendarClassOption = "all" | DisruptionClassId;

const CORRIDOR_TONES: StackedBarSegment["tone"][] = ["corridor-a", "corridor-b", "corridor-c", "corridor-d"];
const CORRIDOR_PATTERNS: StackedBarSegment["pattern"][] = ["solid", "stripe", "dots", "solid"];

function shortDate(date: string, granularity: AnalyticsGranularity): string {
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(new Date(`${date}T00:00:00Z`)).replace(/\./g, "");
  }
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`)).replace(/\./g, "");
}

export function SlowZonesModule({
  lines,
  query,
  range,
  availability,
  demo,
  demoModule,
  onDrilldown,
}: {
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
  demo: boolean;
  demoModule: DemoModule | null;
  onDrilldown: (patch: Partial<AnalyticsDrilldown>) => void;
}) {
  const [sectionRef, seen] = useInView(false);
  const [active, setActive] = useState<StackedBarItem | null>(null);
  const days = range.from && range.to ? serviceDayCount(range.from, range.to) : 0;
  const granularity: AnalyticsGranularity = granularityAllowed(days, "day") ? "day" : defaultSeriesGranularity(days);

  const seriesPath = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ network: "ttc", from: range.from, to: range.to, granularity });
    if (query.line) params.set("line", query.line);
    if (query.line && query.station) params.set("station", query.station);
    return `/api/reliability/series?${params.toString()}`;
  }, [range.from, range.to, granularity, query.line, query.station]);

  const slowDrilldown = useMemo<AnalyticsDrilldown>(
    () => ({ ...emptyAnalyticsDrilldown, disruptionClass: "slow-zone", sort: "longest" }),
    [],
  );

  const longestPath = useMemo(() => {
    if (!range.from || !range.to) return null;
    return buildEpisodesPath("ttc", range.from, range.to, query.line, query.station, slowDrilldown, { limit: 8 });
  }, [range.from, range.to, query.line, query.station, slowDrilldown]);

  const demoSeriesData = useMemo<AnalyticsSeriesResponse | null>(
    () => demo && demoModule ? demoModule.demoSeries("ttc", lines, query, range, availability, granularity, false) : null,
    [demo, demoModule, lines, query, range, availability, granularity],
  );
  const demoLongestData = useMemo<AnalyticsEpisodesResponse | null>(
    () => demo && demoModule ? demoModule.demoEpisodes("ttc", lines, query, range, availability, slowDrilldown, null, 8) : null,
    [demo, demoModule, lines, query, range, availability, slowDrilldown],
  );

  const seriesRes = useAnalyticsResource<AnalyticsSeriesResponse>(seriesPath, seen, demoSeriesData, demo);
  const longestRes = useAnalyticsResource<AnalyticsEpisodesResponse>(longestPath, seen, demoLongestData, demo);
  const buckets = useMemo(() => seriesRes.data?.buckets ?? [], [seriesRes.data]);
  const longest = longestRes.data?.episodes ?? [];

  const items = useMemo<StackedBarItem[]>(() => buckets.map((bucket) => {
    const label = formatServiceDateRange(bucket.from, bucket.to);
    const shortLabel = shortDate(bucket.from, granularity);
    const isGap = bucket.analyzableDays === 0 || bucket.incidents === null;
    if (isGap) {
      return {
        id: bucket.from,
        label,
        shortLabel,
        total: null,
        segments: [],
        today: bucket.includesToday,
        ariaLabel: `${label}: Coverage gap, no analyzable day.`,
        tooltip: <span><strong>{label}</strong> — Coverage gap. Slow zones are not counted as zero.</span>,
      };
    }
    const count = slowZoneDayCount(bucket);
    const suffix = bucket.includesToday ? " (Today So Far)" : "";
    return {
      id: bucket.from,
      label,
      shortLabel,
      total: count,
      segments: count > 0 ? [{ key: "slow-zone", label: "Active Slow Zones", value: count, tone: "slow", pattern: "dots" }] : [],
      today: bucket.includesToday,
      partial: bucket.pollingPercentage < 95,
      ariaLabel: `${label}${suffix}: ${count} active slow ${count === 1 ? "zone" : "zones"}. Select to inspect.`,
      tooltip: (
        <span>
          <strong>{label}{suffix}</strong> — {count} distinct slow {count === 1 ? "zone" : "zones"} active during observed service.
        </span>
      ),
    };
  }), [buckets, granularity]);

  const bucketById = useMemo(() => new Map(buckets.map((b) => [b.from, b])), [buckets]);

  const table = (
    <ChartDataTable
      caption="Active Slow Zones Table"
      columns={[
        { key: "period", label: granularity === "day" ? "Date" : "Period", align: "left" },
        { key: "zones", label: "Active Slow Zones" },
        { key: "coverage", label: "Coverage" },
      ]}
      rows={buckets.map((b) => {
        const gap = b.analyzableDays === 0 || b.incidents === null;
        return {
          id: b.from,
          cells: {
            period: `${formatServiceDateRange(b.from, b.to)}${b.includesToday ? " (Today So Far)" : ""}`,
            zones: gap ? "Gap" : slowZoneDayCount(b).toLocaleString("en-CA"),
            coverage: gap ? "Coverage Gap" : `${b.pollingPercentage.toFixed(0)}%`,
          },
        };
      })}
    />
  );

  return (
    <ChartFrame
      id="slow-zones"
      sectionRef={sectionRef}
      title="TTC Slow Zones"
      subtitle={`Distinct Reduced Speed Zones active per ${granularity} during observed service, and the longest-running zones in this range.`}
      legend={(
        <ul className={styles.legendList}>
          <li><span className={styles.legendSwatch} data-tone="slow" data-pattern="dots" />Active Slow Zones</li>
          <li><span className={styles.legendSwatch} data-tone="gap" />Coverage Gap</li>
          <li><span className={styles.legendSwatch} data-tone="today" />Today So Far</li>
        </ul>
      )}
      readout={active?.tooltip}
      defaultReadout="Select a bar to filter Slow Zone episodes for that period."
      table={buckets.length ? table : undefined}
      loading={seriesRes.loading || (!seen && !demo)}
      error={seriesRes.error}
      onRetry={() => { seriesRes.retry(); longestRes.retry(); }}
      empty={seen && !seriesRes.loading && !seriesRes.error && buckets.length === 0}
      footer={seen && !longestRes.loading && longest.length > 0 ? (
        <div className={styles.subList}>
          <div className={styles.subListHeader}>
            <h3>Longest-Running Slow Zones in Range</h3>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onDrilldown({ disruptionClass: "slow-zone", sort: "longest" })}
            >
              View All in Episodes
            </button>
          </div>
          <ol className={styles.slowZoneList}>
            {longest.map((ep) => (
              <li key={ep.id}>
                <div className={styles.slowZoneMain}>
                  <TransitLineBadge lineId={ep.lineId} lineNumber={ep.lineNumber ?? undefined} size={22} decorative />
                  <div>
                    <p className={styles.episodeTitle}>{ep.title}</p>
                    <p className={styles.episodeMeta}>
                      Opened {formatServiceDate(ep.openedAt.slice(0, 10))}
                      {ep.active ? " · Still Active" : ep.closedAt ? ` · Cleared ${formatServiceDate(ep.closedAt.slice(0, 10))}` : ""}
                    </p>
                  </div>
                </div>
                <span className={styles.slowZoneDuration}>{formatHours(ep.countedMinutes)} hr counted</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    >
      <StackedBarChart
        accessibleName={`Active TTC slow zones per ${granularity}`}
        items={items}
        unitLabel="Active Zones"
        formatAxis={(v) => String(Math.round(v))}
        onActiveChange={setActive}
        onSelect={(item) => {
          const b = bucketById.get(item.id);
          if (b) onDrilldown({ from: b.from, to: b.to, disruptionClass: "slow-zone" });
        }}
      />
    </ChartFrame>
  );
}

export function CancellationsModule({
  lines,
  query,
  range,
  availability,
  demo,
  demoModule,
}: {
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
  demo: boolean;
  demoModule: DemoModule | null;
}) {
  const [sectionRef, seen] = useInView(false);
  const days = range.from && range.to ? serviceDayCount(range.from, range.to) : 0;
  const [chosenGranularity, setChosenGranularity] = useState<AnalyticsGranularity | null>(null);
  const granularity: AnalyticsGranularity = chosenGranularity && granularityAllowed(days, chosenGranularity)
    ? chosenGranularity
    : defaultSeriesGranularity(days);
  const [active, setActive] = useState<StackedBarItem | null>(null);

  const path = (() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ network: "regional", from: range.from, to: range.to, granularity });
    if (query.line) params.set("line", query.line);
    if (query.line && query.station) params.set("station", query.station);
    return `/api/reliability/cancellations?${params.toString()}`;
  })();

  const demoData: AnalyticsCancellationsResponse | null = demo && demoModule
    ? demoModule.demoCancellations("regional", lines, query, range, availability, granularity)
    : null;

  const resource = useAnalyticsResource<AnalyticsCancellationsResponse>(path, seen, demoData, demo);
  const data = resource.data;
  const buckets = data?.buckets ?? [];
  const topCorridors = (data?.totals?.corridors ?? []).slice(0, 3);
  const topIds = new Set(topCorridors.map((c) => c.id));

  const items: StackedBarItem[] = buckets.map((bucket) => {
    const label = formatServiceDateRange(bucket.from, bucket.to);
    const shortLabel = shortDate(bucket.from, granularity);
    const untracked = bucket.trackedDays === 0 || bucket.cancellations === null;
    if (untracked) {
      return {
        id: bucket.from,
        label,
        shortLabel,
        total: null,
        segments: [],
        today: bucket.includesToday,
        ariaLabel: `${label}: Not tracked for train cancellations.`,
        tooltip: <span><strong>{label}</strong> — No train cancellation tracking coverage. Not counted as zero.</span>,
      };
    }
    const segments: StackedBarSegment[] = [];
    topCorridors.forEach((corridor, idx) => {
      const found = bucket.corridors.find((c) => c.lineId === corridor.id);
      if (found && found.cancellations > 0) {
        segments.push({
          key: corridor.id,
          label: corridor.label,
          value: found.cancellations,
          tone: CORRIDOR_TONES[idx],
          pattern: CORRIDOR_PATTERNS[idx],
        });
      }
    });
    const otherCount = bucket.corridors
      .filter((c) => !topIds.has(c.lineId))
      .reduce((sum, c) => sum + c.cancellations, 0);
    if (otherCount > 0) {
      segments.push({ key: "other", label: "Other Corridors", value: otherCount, tone: "corridor-d", pattern: "solid" });
    }
    const suffix = bucket.includesToday ? " (Today So Far)" : "";
    const detailCorridors = bucket.corridors.slice(0, 3).map((c) => `${c.label}: ${c.cancellations}`).join(", ");
    return {
      id: bucket.from,
      label,
      shortLabel,
      total: bucket.cancellations ?? 0,
      segments,
      today: bucket.includesToday,
      partial: bucket.coveragePercentage < 95,
      ariaLabel: `${label}${suffix}: ${bucket.cancellations} cancelled trains (${bucket.scheduleMatchedCancellations} schedule-matched).`,
      tooltip: (
        <span>
          <strong>{label}{suffix}</strong> — {bucket.cancellations} cancelled {bucket.cancellations === 1 ? "train" : "trains"}
          {" "}({bucket.scheduleMatchedCancellations} schedule-matched){detailCorridors ? ` · ${detailCorridors}` : ""}
          {" · "}Tracking coverage {bucket.coveragePercentage.toFixed(0)}%
        </span>
      ),
    };
  });

  const table = (
    <ChartDataTable
      caption="GO and UP Train Cancellations Table"
      columns={[
        { key: "period", label: "Period", align: "left" },
        { key: "total", label: "Cancelled Trains" },
        { key: "matched", label: "Schedule-Matched" },
        { key: "coverage", label: "Tracking Coverage" },
      ]}
      rows={buckets.map((b) => {
        const untracked = b.trackedDays === 0 || b.cancellations === null;
        return {
          id: b.from,
          cells: {
            period: `${formatServiceDateRange(b.from, b.to)}${b.includesToday ? " (Today So Far)" : ""}`,
            total: untracked ? "Untracked" : (b.cancellations ?? 0).toLocaleString("en-CA"),
            matched: untracked ? "—" : (b.scheduleMatchedCancellations ?? 0).toLocaleString("en-CA"),
            coverage: untracked ? "0%" : `${b.coveragePercentage.toFixed(0)}% (${b.trackedDays}/${b.days} d)`,
          },
        };
      })}
    />
  );

  return (
    <ChartFrame
      id="cancellations"
      sectionRef={sectionRef}
      title="GO & UP Train Cancellations"
      subtitle="Tracked separately from reliability minutes with its own coverage. Untracked buckets are hatched, never zero."
      controls={(
        <div className={styles.segmentedSmall} role="group" aria-label="Cancellations Granularity">
          {(["day", "week", "month"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={granularity === unit}
              disabled={!granularityAllowed(days, unit)}
              onClick={() => setChosenGranularity(unit)}
            >
              {unit[0].toUpperCase() + unit.slice(1)}
            </button>
          ))}
        </div>
      )}
      legend={data ? (
        <div className={styles.durationStatsRow}>
          <ul className={styles.legendList}>
            {topCorridors.map((corridor, idx) => (
              <li key={corridor.id}>
                <span className={styles.legendSwatch} data-tone={CORRIDOR_TONES[idx]} data-pattern={CORRIDOR_PATTERNS[idx]} />
                {corridor.label} ({corridor.cancellations})
              </li>
            ))}
            {(data.totals?.corridors.length ?? 0) > 3 ? (
              <li><span className={styles.legendSwatch} data-tone="corridor-d" />Other Corridors</li>
            ) : null}
            <li><span className={styles.legendSwatch} data-tone="gap" />Untracked Gap</li>
          </ul>
          <span className={styles.coveragePill}>
            {formatPercentage(data.coverage.coveragePercentage)} · {confidenceLabel(data.coverage.confidence)}
            {data.totals ? ` · ${data.totals.cancellations.toLocaleString("en-CA")} Total (${data.totals.scheduleMatchedCancellations.toLocaleString("en-CA")} Schedule-Matched)` : ""}
          </span>
        </div>
      ) : undefined}
      readout={active?.tooltip}
      defaultReadout="Hover or focus any bar for corridor cancellation counts and tracking coverage."
      table={buckets.length ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && buckets.length === 0}
      emptyMessage="No train cancellation tracking data in this range."
    >
      <StackedBarChart
        accessibleName={`GO and UP train cancellations by ${granularity}`}
        items={items}
        unitLabel="Cancelled Trains"
        formatAxis={(v) => String(Math.round(v))}
        onActiveChange={setActive}
      />
    </ChartFrame>
  );
}

export function CalendarModule({
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
  const [sectionRef, seen] = useInView(false);
  const [selectedClass, setSelectedClass] = useState<CalendarClassOption>("all");
  const [active, setActive] = useState<{ lineLabel: string; cell: CalendarDayCell } | null>(null);
  const activeClass: CalendarClassOption = !showSlowZones && selectedClass === "slow-zone" ? "all" : selectedClass;

  const calWindow = useMemo(
    () => range.from && range.to ? calendarRange(range.from, range.to) : null,
    [range.from, range.to],
  );

  const path = useMemo(() => {
    if (!calWindow) return null;
    const params = new URLSearchParams({
      network: networkId,
      from: calWindow.from,
      to: calWindow.to,
      granularity: "day",
    });
    if (query.line) {
      params.set("line", query.line);
      if (query.station) params.set("station", query.station);
      else params.set("byLine", "true");
    } else {
      params.set("byLine", "true");
    }
    return `/api/reliability/series?${params.toString()}`;
  }, [networkId, calWindow, query.line, query.station]);

  const demoData = useMemo<AnalyticsSeriesResponse | null>(() => {
    if (!demo || !demoModule || !calWindow) return null;
    return demoModule.demoSeries(
      networkId, lines, query,
      { ...range, from: calWindow.from, to: calWindow.to },
      availability, "day", !query.station,
    );
  }, [demo, demoModule, calWindow, networkId, lines, query, range, availability]);

  const resource = useAnalyticsResource<AnalyticsSeriesResponse>(path, seen, demoData, demo);
  const buckets = useMemo(() => resource.data?.buckets ?? [], [resource.data]);

  const { calendarRows, weekCount, monthLabels } = useMemo(() => {
    const dates = buckets.map((b) => b.from);
    const grid = calendarGridDates(dates);
    const scopedLines = query.line ? lines.filter((l) => l.id === query.line) : lines;

    const pickShare = (
      entry: { weightedSharePercentage: number | null; serviceStoppedShare: number | null; delayShare: number | null; slowZoneShare: number | null },
    ): number | null => {
      if (activeClass === "service-stopped") return entry.serviceStoppedShare;
      if (activeClass === "delay") return entry.delayShare;
      if (activeClass === "slow-zone") return entry.slowZoneShare;
      return entry.weightedSharePercentage;
    };

    const rows: CalendarLineRow[] = scopedLines.map((line) => ({
      lineId: line.id,
      number: line.number,
      label: networkId === "ttc" ? `Line ${line.number} ${line.name}` : line.name,
      days: buckets.map((bucket) => {
        const pos = grid.weekByDate.get(bucket.from) ?? { weekday: 0, weekIndex: 0 };
        const dateLabel = formatServiceDate(bucket.from);
        const todayTag = bucket.includesToday ? " (Today So Far)" : "";
        if (bucket.analyzableDays === 0) {
          return {
            date: bucket.from, weekday: pos.weekday, weekIndex: pos.weekIndex,
            state: "gap" as const, today: bucket.includesToday, sharePercentage: null,
            ariaLabel: `${line.name}, ${dateLabel}: Coverage gap.`,
            tooltip: <span><strong>{line.name} · {dateLabel}</strong> — Coverage gap (not counted as zero).</span>,
          };
        }
        const lineData = bucket.lines?.find((l) => l.lineId === line.id);
        // Station-scoped requests do not populate bucket.lines; fall back to bucket totals.
        const observed = lineData ? lineData.observedMinutes : bucket.observedMinutes;
        if (observed <= 0) {
          return {
            date: bucket.from, weekday: pos.weekday, weekIndex: pos.weekIndex,
            state: "no-service" as const, today: bucket.includesToday, sharePercentage: null,
            ariaLabel: `${line.name}, ${dateLabel}: No scheduled service.`,
            tooltip: <span><strong>{line.name} · {dateLabel}</strong> — No scheduled service on this date.</span>,
          };
        }
        let share: number | null;
        if (lineData) {
          share = pickShare(lineData);
        } else {
          share = activeClass === "all"
            ? bucket.weightedSharePercentage
            : (bucket.classes.find((c) => c.disruptionClass === activeClass)?.weightedSharePercentage ?? 0);
        }
        const safeShare = share ?? 0;
        const classTitle = activeClass === "all" ? "Share Affected" : CLASS_LABELS[activeClass];
        return {
          date: bucket.from, weekday: pos.weekday, weekIndex: pos.weekIndex,
          state: "observed" as const, today: bucket.includesToday, sharePercentage: safeShare,
          ariaLabel: `${line.name}, ${dateLabel}${todayTag}: ${formatPercentage(safeShare)} ${classTitle}. Select to view episodes.`,
          tooltip: (
            <span>
              <strong>{line.name} · {dateLabel}{todayTag}</strong> — {formatPercentage(safeShare)} ({classTitle}) · {formatMinutes(observed)} observed.
            </span>
          ),
        };
      }),
    }));
    return { calendarRows: rows, weekCount: grid.weekCount, monthLabels: grid.monthLabels };
  }, [buckets, lines, query.line, networkId, activeClass]);

  const tone = activeClass === "service-stopped" ? "stopped"
    : activeClass === "delay" ? "delay"
      : activeClass === "slow-zone" ? "slow" : "accent";

  const table = (
    <ChartDataTable
      caption="Per-Line Daily Impact Calendar Table"
      columns={[
        { key: "date", label: "Date", align: "left" },
        ...calendarRows.map((r) => ({ key: r.lineId, label: networkId === "ttc" ? `Line ${r.number}` : r.label })),
      ]}
      rows={buckets.map((bucket) => {
        const rowCells: Record<string, React.ReactNode> = {
          date: `${formatServiceDate(bucket.from)}${bucket.includesToday ? " (Today So Far)" : ""}`,
        };
        for (const r of calendarRows) {
          const day = r.days.find((d) => d.date === bucket.from);
          rowCells[r.lineId] = !day || day.state === "gap"
            ? "Gap"
            : day.state === "no-service"
              ? "No Service"
              : formatPercentage(day.sharePercentage ?? 0);
        }
        return { id: bucket.from, cells: rowCells };
      })}
    />
  );

  const classOptions: Array<{ value: CalendarClassOption; label: string }> = [
    { value: "all", label: "All" },
    { value: "service-stopped", label: "Service Stopped" },
    { value: "delay", label: "Delays" },
    ...(showSlowZones ? [{ value: "slow-zone" as const, label: "Slow Zones" }] : []),
  ];

  return (
    <ChartFrame
      id="calendar"
      sectionRef={sectionRef}
      title="Daily Calendar"
      subtitle={calWindow?.capped
        ? `Per-${networkId === "ttc" ? "line" : "corridor"} daily impact for the last 366 days of this range (${formatServiceDateRange(calWindow.from, calWindow.to)}).`
        : `Per-${networkId === "ttc" ? "line" : "corridor"} daily impact across the selected range.`}
      controls={(
        <div className={styles.segmentedSmall} role="group" aria-label="Calendar Class Filter">
          {classOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={activeClass === opt.value}
              onClick={() => setSelectedClass(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      legend={(
        <ul className={styles.legendList}>
          <li><span className={styles.legendSwatch} data-tone="level-0" />0%</li>
          <li><span className={styles.legendSwatch} data-tone="level-2" />Moderate</li>
          <li><span className={styles.legendSwatch} data-tone="level-4" />High Share</li>
          <li><span className={styles.legendSwatch} data-tone="gap" />Coverage Gap</li>
          <li><span className={styles.legendSwatch} data-tone="no-service" />No Service</li>
          <li><span className={styles.legendSwatch} data-tone="today" />Today So Far</li>
        </ul>
      )}
      readout={active?.cell.tooltip}
      defaultReadout="Hover or focus any day cell for details; select an observed day to filter episodes on that line."
      table={buckets.length ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && buckets.length === 0}
      emptyMessage="No calendar days available in this range."
    >
      <CalendarChart
        accessibleName="Per-line daily impact calendar"
        rows={calendarRows}
        weekCount={weekCount}
        monthLabels={monthLabels}
        tone={tone}
        onActiveChange={setActive}
        onSelect={(lineId, cell) => onDrilldown({
          from: cell.date,
          to: cell.date,
          line: lineId,
          station: null,
          disruptionClass: activeClass === "all" ? null : activeClass,
        })}
      />
    </ChartFrame>
  );
}
