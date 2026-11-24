"use client";

import { useMemo, useState } from "react";
import {
  CLASS_LABELS,
  DAY_OF_WEEK_LABELS,
  formatHourLabel,
  formatHourOfWeek,
  formatMinutes,
  formatPercentage,
  type AnalyticsAvailability,
  type AnalyticsHotspotsResponse,
  type AnalyticsNetworkId,
  type AnalyticsPatternsResponse,
  type DisruptionClassId,
} from "../../app/reliability-analytics";
import type {
  AnalyticsDrilldown,
  AnalyticsLineOption,
  AnalyticsQuery,
  ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { useAnalyticsResource } from "../../hooks/useAnalyticsResource";
import { TransitLineBadge } from "../TransitLineBadge";
import { ClassIcon } from "./AnalyticsIcons";
import { ChartDataTable, ChartFrame, useInView } from "./ChartFrame";
import { HeatmapChart, type HeatmapCellItem } from "./HeatmapChart";
import { RankedBarChart, type RankedBarItem } from "./RankedBarChart";
import { ShareScale } from "./ShareScale";
import styles from "./analytics.module.css";

type DemoModule = typeof import("../../app/reliability-analytics-fixture");
type ClassFilterOption = "all" | DisruptionClassId;

export function WhenModule({
  networkId,
  query,
  range,
  availability,
  showSlowZones,
  demo,
  demoModule,
  onDrilldown,
}: {
  networkId: AnalyticsNetworkId;
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
  showSlowZones: boolean;
  demo: boolean;
  demoModule: DemoModule | null;
  onDrilldown: (patch: Partial<AnalyticsDrilldown>) => void;
}) {
  const [sectionRef, seen] = useInView(false);
  // As in Where: TTC slow zones run all day, so "All" would fill every hour alike.
  const [selectedClass, setSelectedClass] = useState<ClassFilterOption>(
    networkId === "ttc" ? "service-stopped" : "all",
  );
  const [active, setActive] = useState<HeatmapCellItem | null>(null);
  const activeClass: ClassFilterOption = !showSlowZones && selectedClass === "slow-zone" ? "all" : selectedClass;

  const path = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ network: networkId, from: range.from, to: range.to });
    if (query.line) params.set("line", query.line);
    if (query.line && query.station) params.set("station", query.station);
    return `/api/reliability/patterns?${params.toString()}`;
  }, [networkId, range.from, range.to, query.line, query.station]);

  const demoData = useMemo<AnalyticsPatternsResponse | null>(
    () => demo && demoModule ? demoModule.demoPatterns(networkId, query, range, availability) : null,
    [demo, demoModule, networkId, query, range, availability],
  );

  const resource = useAnalyticsResource<AnalyticsPatternsResponse>(path, seen, demoData, demo);
  const rawCells = useMemo(() => resource.data?.cells ?? [], [resource.data]);

  const cells = useMemo<HeatmapCellItem[]>(() => rawCells.map((cell) => {
    const valueMinutes = activeClass === "all"
      ? cell.anyAlertMinutes
      : (cell.classMinutes?.[activeClass] ?? 0);
    const sharePercentage = cell.observedMinutes > 0
      ? Math.min(100, Math.round(valueMinutes * 1000 / cell.observedMinutes) / 10)
      : 0;
    const when = formatHourOfWeek(cell.dayOfWeek, cell.hour);
    const classTitle = activeClass === "all" ? "Any Alert" : CLASS_LABELS[activeClass];
    const ariaLabel = cell.observedMinutes <= 0
      ? `${when}: No observed service.`
      : `${when}: ${formatPercentage(sharePercentage)} (${formatMinutes(valueMinutes)} of ${formatMinutes(cell.observedMinutes)} observed) for ${classTitle}.`;
    return {
      dayOfWeek: cell.dayOfWeek,
      hour: cell.hour,
      observedMinutes: cell.observedMinutes,
      valueMinutes,
      sharePercentage,
      ariaLabel,
      tooltip: cell.observedMinutes <= 0 ? (
        <span><strong>{when}</strong> — No observed scheduled service in this hour.</span>
      ) : (
        <span>
          <strong>{when}</strong> — {formatPercentage(sharePercentage)} ({formatMinutes(valueMinutes)} of {formatMinutes(cell.observedMinutes)} observed line-minutes · {classTitle}).
        </span>
      ),
    };
  }), [rawCells, activeClass]);

  const hasObserved = cells.some((c) => c.observedMinutes > 0);

  const table = (
    <ChartDataTable
      caption="Hour-of-Week Disruption Table"
      columns={[
        { key: "hour", label: "Hour (Toronto)", align: "left" },
        ...DAY_OF_WEEK_LABELS.map((day, idx) => ({ key: `d${idx + 1}`, label: day })),
      ]}
      rows={Array.from({ length: 24 }, (_, hour) => {
        const rowCells: Record<string, React.ReactNode> = { hour: formatHourLabel(hour) };
        for (let dow = 1; dow <= 7; dow++) {
          const cell = cells.find((c) => c.dayOfWeek === dow && c.hour === hour);
          rowCells[`d${dow}`] = !cell || cell.observedMinutes <= 0 ? "—" : formatPercentage(cell.sharePercentage);
        }
        return { id: String(hour), cells: rowCells };
      })}
    />
  );

  const classOptions: Array<{ value: ClassFilterOption; label: string }> = [
    { value: "all", label: "All" },
    { value: "service-stopped", label: "Service Stopped" },
    { value: "delay", label: "Delays" },
    ...(showSlowZones ? [{ value: "slow-zone" as const, label: "Slow Zones" }] : []),
  ];

  return (
    <ChartFrame
      id="when"
      sectionRef={sectionRef}
      title="When"
      subtitle="How much of the observed service in each hour of the week was affected, in Toronto time."
      controls={(
        <div className={styles.segmentedSmall} role="group" aria-label="When Class Filter">
          {classOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={activeClass === opt.value}
              onClick={() => setSelectedClass(opt.value)}
            >
              <ClassIcon id={opt.value} size={13} plain />{opt.label}
            </button>
          ))}
        </div>
      )}
      legend={(
        <ShareScale max={Math.max(0, ...cells.map((cell) => cell.sharePercentage))}>
          <li><span className={styles.legendSwatch} data-tone="gap" />No Observed Service</li>
        </ShareScale>
      )}
      readout={active?.tooltip}
      defaultReadout="Hover or focus any cell for Toronto hour-of-week share; select a cell to filter matching episodes."
      table={hasObserved ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && !hasObserved}
      emptyMessage="No observed hour-of-week data in this range."
    >
      <HeatmapChart
        accessibleName="Hour-of-week disruption heatmap in Toronto time"
        cells={cells}
        onActiveChange={setActive}
        onSelect={(cell) => onDrilldown({
          dayOfWeek: cell.dayOfWeek,
          hour: cell.hour,
          disruptionClass: activeClass === "all" ? null : activeClass,
        })}
      />
    </ChartFrame>
  );
}

export function WhereModule({
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
  // Default TTC hotspots to Service Stopped so Line 1 slow zones never bury every Line 1 station near 100%.
  const [selectedClass, setSelectedClass] = useState<ClassFilterOption>(
    networkId === "ttc" ? "service-stopped" : "all",
  );
  const [sort, setSort] = useState<"minutes" | "incidents">("minutes");
  const activeClass: ClassFilterOption = !showSlowZones && selectedClass === "slow-zone" ? "all" : selectedClass;
  const classParam: DisruptionClassId | null = activeClass === "all" ? null : activeClass;

  const path = useMemo(() => {
    if (!range.from || !range.to) return null;
    const params = new URLSearchParams({ network: networkId, from: range.from, to: range.to, sort, limit: "12" });
    if (query.line) params.set("line", query.line);
    if (query.line && query.station) params.set("station", query.station);
    if (classParam) params.set("class", classParam);
    return `/api/reliability/hotspots?${params.toString()}`;
  }, [networkId, range.from, range.to, sort, query.line, query.station, classParam]);

  const demoData = useMemo<AnalyticsHotspotsResponse | null>(
    () => demo && demoModule ? demoModule.demoHotspots(networkId, lines, query, range, availability, classParam, sort, 12) : null,
    [demo, demoModule, networkId, lines, query, range, availability, classParam, sort],
  );

  const resource = useAnalyticsResource<AnalyticsHotspotsResponse>(path, seen, demoData, demo);
  const stations = useMemo(() => resource.data?.stations ?? [], [resource.data]);
  const tone = activeClass === "service-stopped" ? "stopped"
    : activeClass === "delay" ? "delay"
      : activeClass === "slow-zone" ? "slow" : "accent";

  const items = useMemo<RankedBarItem[]>(() => stations.map((station) => ({
    id: `${station.lineId}::${station.stationId}`,
    rank: station.rank,
    label: station.stationName,
    secondary: networkId === "ttc" ? `Line ${station.lineNumber}` : station.lineLabel,
    badge: <TransitLineBadge lineId={station.lineId} lineNumber={station.lineNumber ?? undefined} size={20} decorative />,
    value: sort === "incidents" ? station.incidents : station.weightedMinutes,
    valueText: sort === "incidents"
      ? `${station.incidents.toLocaleString("en-CA")} ${station.incidents === 1 ? "incident" : "incidents"}`
      : formatMinutes(Math.round(station.weightedMinutes)),
    detailText: sort === "incidents"
      ? `${formatPercentage(station.sharePercentage)} · ${formatMinutes(Math.round(station.weightedMinutes))}`
      : `${formatPercentage(station.sharePercentage)} · ${station.incidents.toLocaleString("en-CA")} ${station.incidents === 1 ? "incident" : "incidents"}`,
    tone,
    ariaLabel: `#${station.rank} ${station.stationName} (${station.lineLabel}): ${formatMinutes(Math.round(station.weightedMinutes))}, ${formatPercentage(station.sharePercentage)}, ${station.incidents} incidents. Select to filter episodes.`,
  })), [stations, sort, networkId, tone]);

  const byId = useMemo(() => new Map(stations.map((s) => [`${s.lineId}::${s.stationId}`, s])), [stations]);

  const table = (
    <ChartDataTable
      caption="Station Hotspots Table"
      columns={[
        { key: "station", label: "Station", align: "left" },
        { key: "line", label: networkId === "ttc" ? "Line" : "Corridor", align: "left" },
        { key: "minutes", label: "Counted Time" },
        { key: "share", label: "Share Affected" },
        { key: "incidents", label: "Incidents" },
      ]}
      rows={stations.map((s) => ({
        id: `${s.lineId}::${s.stationId}`,
        cells: {
          station: `${s.rank}. ${s.stationName}`,
          line: networkId === "ttc" ? `Line ${s.lineNumber}` : s.lineLabel,
          minutes: formatMinutes(Math.round(s.weightedMinutes)),
          share: formatPercentage(s.sharePercentage),
          incidents: s.incidents.toLocaleString("en-CA"),
        },
      }))}
    />
  );

  const classOptions: Array<{ value: ClassFilterOption; label: string }> = [
    { value: "service-stopped", label: "Service Stopped" },
    { value: "delay", label: "Delays" },
    ...(showSlowZones ? [{ value: "slow-zone" as const, label: "Slow Zones" }] : []),
    { value: "all", label: "All" },
  ];

  return (
    <ChartFrame
      id="where"
      sectionRef={sectionRef}
      title="Where · Station Hotspots"
      subtitle={networkId === "ttc"
        ? "Stations ranked by alerts naming them. Filtered by disruption class so long-running Line 1 slow zones do not bury closures. Select a station to list its episodes."
        : "Stations ranked by alerts naming them during scheduled, polled service. Select a station to list its episodes."}
      controls={(
        <div className={styles.controlCluster}>
          <div className={styles.segmentedSmall} role="group" aria-label="Hotspot Class Filter">
            {classOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={activeClass === opt.value}
                onClick={() => setSelectedClass(opt.value)}
              >
                <ClassIcon id={opt.value} size={13} plain />{opt.label}
              </button>
            ))}
          </div>
          <div className={styles.segmentedSmall} role="group" aria-label="Hotspot Sort">
            <button type="button" aria-pressed={sort === "minutes"} onClick={() => setSort("minutes")}>Minutes</button>
            <button type="button" aria-pressed={sort === "incidents"} onClick={() => setSort("incidents")}>Incidents</button>
          </div>
        </div>
      )}
      readout={null}
      table={stations.length ? table : undefined}
      loading={resource.loading || (!seen && !demo)}
      error={resource.error}
      onRetry={resource.retry}
      empty={seen && !resource.loading && !resource.error && stations.length === 0}
      emptyMessage="No station-specific disruptions matched this filter in this range."
    >
      <RankedBarChart
        accessibleName="Station hotspots list"
        items={items}
        layout="columns"
        onSelect={(item) => {
          const station = byId.get(item.id);
          if (station) {
            onDrilldown({
              line: station.lineId,
              station: station.stationId,
              disruptionClass: classParam,
            });
          }
        }}
      />
    </ChartFrame>
  );
}
