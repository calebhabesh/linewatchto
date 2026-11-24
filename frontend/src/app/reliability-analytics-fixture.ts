import type {
  AnalyticsAvailability,
  AnalyticsNetworkId,
  AnalyticsRow,
  AnalyticsSummary,
  AnalyticsTotals,
} from "./reliability-analytics.ts";
import {
  addServiceDays,
  serviceDayCount,
  type AnalyticsLineOption,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "./reliability-range.ts";

/** Invented numbers for trying the page without a backend; shown only behind "View Demo Data". */

const CLASSES = [
  { id: "service-stopped", label: "Service Stopped", share: 0.4 },
  { id: "delay", label: "Delays", share: 0.9 },
  { id: "slow-zone", label: "Slow Zones", share: 1.6 },
] as const;

export function demoAvailability(networkId: AnalyticsNetworkId, today: string): AnalyticsAvailability {
  const firstAnalyzableDate = addServiceDays(today, -139);
  return {
    networkId,
    methodologyVersion: 2,
    firstAnalyzableDate,
    today,
    derivedThrough: addServiceDays(today, -1),
    derivationStatus: "success",
    days: Array.from({ length: 140 }, (_, index) => {
      const excluded = index === 112 || index === 113;
      return {
        date: addServiceDays(firstAnalyzableDate, index),
        pollingPercentage: excluded ? 0 : index % 23 === 5 ? 82 : 100,
        scheduleDay: true,
        analyzable: !excluded,
        today: index === 139,
      };
    }),
    sources: [],
    message: "Demo data.",
  };
}

function demoTotals(networkId: AnalyticsNetworkId, observedMinutes: number, weight: number): AnalyticsTotals {
  const classes = CLASSES.map((item) => {
    const share = networkId === "regional" && item.id === "slow-zone" ? 0 : item.share * weight;
    const weightedMinutes = observedMinutes * share / 100;
    const incidents = Math.round(weightedMinutes / (item.id === "slow-zone" ? 400 : 30));
    return {
      disruptionClass: item.id,
      label: item.label,
      incidents,
      activeIncidents: 0,
      uniqueMinutes: Math.round(weightedMinutes * 3),
      weightedMinutes,
      weightedSharePercentage: share,
      incidentDisruptionMinutes: Math.round(weightedMinutes * 3.5),
    };
  });
  const sum = (pick: (item: (typeof classes)[number]) => number) => classes.reduce((total, item) => total + pick(item), 0);
  const unique = Math.min(observedMinutes, sum((item) => item.uniqueMinutes));
  return {
    observedMinutes,
    incidents: sum((item) => item.incidents),
    activeIncidents: 0,
    medianTimeToClearMinutes: Math.round(11 + weight * 4),
    p90TimeToClearMinutes: Math.round(64 + weight * 30),
    uniqueMinutes: unique,
    anyAlertPercentage: observedMinutes ? unique / observedMinutes * 100 : 0,
    incidentDisruptionMinutes: sum((item) => item.incidentDisruptionMinutes),
    weightedImpactMinutes: sum((item) => item.weightedMinutes),
    weightedImpactPercentage: sum((item) => item.weightedSharePercentage),
    classes,
  };
}

export function demoSummary(
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
): AnalyticsSummary | null {
  const { from, to } = range;
  if (!from || !to) return null;
  const line = lines.find((candidate) => candidate.id === query.line);
  const days = serviceDayCount(from, to);
  const inRange = availability.days.filter((day) => day.date >= from && day.date <= to);
  const analyzable = inRange.filter((day) => day.analyzable);
  const polling = inRange.reduce((total, day) => total + day.pollingPercentage, 0) / Math.max(1, inRange.length);
  const coverage = {
    pollingPercentage: polling,
    schedulePercentage: 100,
    effectivePercentage: polling,
    confidence: polling >= 95 ? "high" as const : polling >= 75 ? "medium" as const : "low" as const,
    analyzableDays: analyzable.length,
    totalDays: days,
    label: "Demo coverage",
  };
  const items = line
    ? line.stations.filter((station) => !query.station || station.id === query.station)
    : lines;
  const rowsFor = (scale: number): AnalyticsRow[] => items.map((item, index) => ({
    ...demoTotals(networkId, analyzable.length * 1_080, scale * (0.3 + ((index * 7) % 5) * 0.35)),
    id: item.id,
    number: "number" in item ? item.number : null,
    label: item.name,
    lineId: line?.id ?? null,
  }));
  const totals = (rows: AnalyticsRow[]) => demoTotals(
    networkId,
    analyzable.length * 1_080 * (line ? 1 : lines.length),
    rows.reduce((total, row) => total + row.weightedImpactPercentage, 0) / Math.max(1, rows.length) / 2.9,
  );
  const rows = rowsFor(1);
  const previousTo = addServiceDays(from, -1);
  const previousFrom = addServiceDays(previousTo, 1 - days);
  const hasPrevious = Boolean(availability.firstAnalyzableDate && previousFrom >= availability.firstAnalyzableDate);
  const previousRows = rowsFor(0.85);
  return {
    networkId,
    methodologyVersion: 2,
    range: { from, to, days, firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: to === availability.today },
    coverage,
    scope: line ? "stations" : "lines",
    lineId: line?.id ?? null,
    stationId: line ? query.station : null,
    totals: totals(rows),
    rows,
    previous: hasPrevious
      ? { from: previousFrom, to: previousTo, coverage, totals: totals(previousRows), rows: line ? [] : previousRows }
      : null,
    previousUnavailableReason: hasPrevious
      ? null
      : `The previous ${days} days start before history starts on ${availability.firstAnalyzableDate}.`,
    message: "Demo data. These numbers are invented and do not describe any service.",
  };
}
