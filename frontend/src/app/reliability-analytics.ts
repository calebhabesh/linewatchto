import type { DisruptionClassMetricItem } from "./linewatch-data.ts";
import { addServiceDays, formatServiceDateRange, type ResolvedAnalyticsRange } from "./reliability-range.ts";

/** Shapes of the range API (`/api/reliability/availability` and `/summary`). */
export type AnalyticsNetworkId = "ttc" | "regional";
export type AnalyticsConfidence = "low" | "medium" | "high";

export type AnalyticsAvailabilityDay = {
  date: string;
  pollingPercentage: number;
  scheduleDay: boolean;
  analyzable: boolean;
  today: boolean;
};

export type AnalyticsAvailability = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  firstAnalyzableDate: string | null;
  today: string;
  derivedThrough: string | null;
  derivationStatus: string;
  days: AnalyticsAvailabilityDay[];
  sources: { id: string; label: string; role: string }[];
  message: string;
};

export type AnalyticsCoverage = {
  pollingPercentage: number;
  schedulePercentage: number;
  effectivePercentage: number;
  confidence: AnalyticsConfidence;
  analyzableDays: number;
  totalDays: number;
  label: string;
};

export type AnalyticsTotals = {
  observedMinutes: number;
  incidents: number;
  activeIncidents: number;
  medianTimeToClearMinutes: number | null;
  p90TimeToClearMinutes: number | null;
  uniqueMinutes: number;
  anyAlertPercentage: number;
  incidentDisruptionMinutes: number;
  weightedImpactMinutes: number;
  weightedImpactPercentage: number;
  classes: DisruptionClassMetricItem[];
};

export type AnalyticsRow = AnalyticsTotals & {
  id: string;
  number: string | null;
  label: string;
  lineId: string | null;
};

export type AnalyticsSummary = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: {
    from: string | null;
    to: string | null;
    days: number;
    firstAnalyzableDate: string | null;
    includesToday: boolean;
  };
  coverage: AnalyticsCoverage | null;
  scope: "lines" | "stations";
  lineId: string | null;
  stationId: string | null;
  totals: AnalyticsTotals;
  rows: AnalyticsRow[];
  previous: {
    from: string;
    to: string;
    coverage: AnalyticsCoverage;
    totals: AnalyticsTotals;
    rows: AnalyticsRow[];
  } | null;
  previousUnavailableReason: string | null;
  message: string;
};

export type DisruptionClassId = "service-stopped" | "delay" | "slow-zone";

export function classMetric(totals: AnalyticsTotals, id: DisruptionClassId): DisruptionClassMetricItem | null {
  return totals.classes.find((item) => item.disruptionClass === id) ?? null;
}

/** "10 min", "4 hr 5 min", "3 d 4 hr". */
export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const rounded = Math.round(Math.abs(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  if (hours < 48) return rounded % 60 ? `${hours} hr ${rounded % 60} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} hr` : `${days} d`;
}

/** Minutes as hours with one decimal: "90.6", "1,204.0". */
export function formatHours(minutes: number): string {
  return (minutes / 60).toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function confidenceLabel(confidence: AnalyticsConfidence): string {
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} Confidence`;
}

/** A signed difference rounded first, so "+0.0" is never shown as a rise. */
function signed(value: number, digits: number, text: (magnitude: number) => string): AnalyticsChange {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return { direction: "same", text: "No Change" };
  return { direction: rounded > 0 ? "up" : "down", text: text(Math.abs(rounded)) };
}

export type AnalyticsChange = { direction: "up" | "down" | "same"; text: string };

export type AnalyticsKpi = {
  id: "service-stopped-hours" | "delay-incidents" | "median-time-to-clear" | "share-affected" | "coverage";
  label: string;
  value: string;
  unit: string | null;
  detail: string;
  /** Against the previous period; null when either period has no value. */
  change: AnalyticsChange | null;
};

export function pointsChange(current: number, previous: number): AnalyticsChange {
  return signed(current - previous, 1, (value) => `${value.toFixed(1)} pts`);
}

export function analyticsKpis(
  summary: AnalyticsSummary,
  scope: { networkId: AnalyticsNetworkId; line: boolean; station: boolean },
): AnalyticsKpi[] {
  const { totals, coverage } = summary;
  const previous = summary.previous;
  const stopped = classMetric(totals, "service-stopped");
  const stoppedBefore = previous && classMetric(previous.totals, "service-stopped");
  const delays = classMetric(totals, "delay");
  const delaysBefore = previous && classMetric(previous.totals, "delay");
  const lineNoun = scope.networkId === "ttc" ? "Line" : "Corridor";
  const observed = totals.observedMinutes > 0;
  return [
    {
      id: "service-stopped-hours",
      label: "Service-Stopped Hours",
      value: observed ? formatHours(stopped?.uniqueMinutes ?? 0) : "—",
      unit: observed ? "hr" : null,
      detail: observed
        ? scope.line || scope.station
          ? `${formatPercentage(stopped?.weightedSharePercentage ?? 0)} of service, station-weighted`
          : `Added across all ${lineNoun.toLowerCase()}s`
        : "No covered service",
      change: stopped && stoppedBefore
        ? signed((stopped.uniqueMinutes - stoppedBefore.uniqueMinutes) / 60, 1, (value) => `${value.toFixed(1)} hr`)
        : null,
    },
    {
      id: "delay-incidents",
      label: "Delay Incidents",
      value: observed ? (delays?.incidents ?? 0).toLocaleString("en-CA") : "—",
      unit: null,
      detail: observed ? `${totals.incidents.toLocaleString("en-CA")} incidents of every kind` : "No covered service",
      change: delays && delaysBefore
        ? signed(delays.incidents - delaysBefore.incidents, 0, (value) => value.toLocaleString("en-CA"))
        : null,
    },
    {
      id: "median-time-to-clear",
      label: "Median Time to Clear",
      value: formatMinutes(totals.medianTimeToClearMinutes),
      unit: null,
      detail: totals.p90TimeToClearMinutes == null
        ? "No cleared incidents"
        : `9 in 10 cleared within ${formatMinutes(totals.p90TimeToClearMinutes)}`,
      change: totals.medianTimeToClearMinutes != null && previous?.totals.medianTimeToClearMinutes != null
        ? signed(totals.medianTimeToClearMinutes - previous.totals.medianTimeToClearMinutes, 0, formatMinutes)
        : null,
    },
    {
      id: "share-affected",
      label: scope.station ? "Service Time Affected" : `${lineNoun} Share Affected`,
      value: observed ? formatPercentage(totals.weightedImpactPercentage) : "—",
      unit: null,
      detail: observed ? `${formatPercentage(totals.anyAlertPercentage)} of time with any alert` : "No covered service",
      change: observed && previous && previous.totals.observedMinutes > 0
        ? pointsChange(totals.weightedImpactPercentage, previous.totals.weightedImpactPercentage)
        : null,
    },
    {
      id: "coverage",
      label: "Coverage and Confidence",
      value: coverage ? formatPercentage(coverage.effectivePercentage) : "—",
      unit: null,
      detail: coverage
        ? `${confidenceLabel(coverage.confidence)} · ${coverage.analyzableDays} of ${coverage.totalDays} days counted`
        : "No covered days",
      change: coverage && previous
        ? pointsChange(coverage.effectivePercentage, previous.coverage.effectivePercentage)
        : null,
    },
  ];
}

/** Counts and hours from unevenly covered periods do not compare; shares still do. */
export function comparisonIsUneven(summary: AnalyticsSummary): boolean {
  if (!summary.coverage || !summary.previous) return false;
  return Math.abs(summary.coverage.effectivePercentage - summary.previous.coverage.effectivePercentage) >= 10;
}

export type AnalyticsEmptyState = "not-enough-history" | "no-disruptions" | null;

export function analyticsEmptyState(range: ResolvedAnalyticsRange, summary: AnalyticsSummary | null): AnalyticsEmptyState {
  if (!range.from) return "not-enough-history";
  if (!summary) return null;
  if (!summary.range.from || summary.totals.observedMinutes <= 0) return "not-enough-history";
  return summary.totals.incidents === 0 ? "no-disruptions" : null;
}

/** Below this, a counted day has gaps in polling that could hide disruptions. */
export const FULLY_OBSERVED_PERCENTAGE = 95;

export type CoverageState = "before-history" | "counted" | "partial" | "excluded" | "today";
export type CoverageSegment = { state: CoverageState; from: string; to: string; days: number };

/** The requested range as runs of same-state days, oldest first. */
export function coverageSegments(
  range: ResolvedAnalyticsRange,
  availability: Pick<AnalyticsAvailability, "firstAnalyzableDate" | "days">,
): CoverageSegment[] {
  const byDate = new Map(availability.days.map((day) => [day.date, day]));
  const first = availability.firstAnalyzableDate;
  const segments: CoverageSegment[] = [];
  for (let date = range.requestedFrom; date <= range.requestedTo; date = addServiceDays(date, 1)) {
    const day = byDate.get(date);
    const state: CoverageState = !first || date < first
      ? "before-history"
      : !day?.analyzable
        ? "excluded"
        : day.today
          ? "today"
          : day.pollingPercentage < FULLY_OBSERVED_PERCENTAGE ? "partial" : "counted";
    const last = segments.at(-1);
    if (last?.state === state) {
      last.to = date;
      last.days += 1;
    } else {
      segments.push({ state, from: date, to: date, days: 1 });
    }
  }
  return segments;
}

export function coverageDayTotals(segments: readonly CoverageSegment[]): Record<CoverageState, number> {
  const totals: Record<CoverageState, number> = { "before-history": 0, counted: 0, partial: 0, excluded: 0, today: 0 };
  for (const segment of segments) totals[segment.state] += segment.days;
  return totals;
}

export function segmentDates(segments: readonly CoverageSegment[], state: CoverageState): string[] {
  return segments
    .filter((segment) => segment.state === state)
    .map((segment) => formatServiceDateRange(segment.from, segment.to));
}

export type AnalyticsSortKey =
  | "name" | "share" | "service-stopped" | "delay" | "slow-zone" | "stopped-hours"
  | "incidents" | "median" | "p90" | "any-alert" | "change";
export type AnalyticsSort = { key: AnalyticsSortKey; descending: boolean };

export const defaultAnalyticsSort: AnalyticsSort = { key: "share", descending: true };

function sortValue(row: AnalyticsRow, key: AnalyticsSortKey, previous: ReadonlyMap<string, AnalyticsRow>): number | null {
  switch (key) {
    case "share": return row.weightedImpactPercentage;
    case "service-stopped":
    case "delay":
    case "slow-zone": return classMetric(row, key)?.weightedSharePercentage ?? 0;
    case "stopped-hours": return classMetric(row, "service-stopped")?.uniqueMinutes ?? 0;
    case "incidents": return row.incidents;
    case "median": return row.medianTimeToClearMinutes;
    case "p90": return row.p90TimeToClearMinutes;
    case "any-alert": return row.anyAlertPercentage;
    case "change": {
      const before = previous.get(row.id);
      return before ? row.weightedImpactPercentage - before.weightedImpactPercentage : null;
    }
    default: return null;
  }
}

/** Rows without a value stay last either way; ties keep the API's order. */
export function sortAnalyticsRows(
  rows: readonly AnalyticsRow[],
  sort: AnalyticsSort,
  previousRows: readonly AnalyticsRow[] = [],
): AnalyticsRow[] {
  const direction = sort.descending ? -1 : 1;
  const previous = new Map(previousRows.map((row) => [row.id, row]));
  return [...rows].sort((a, b) => {
    if (sort.key === "name") {
      return direction * `${a.number ?? ""} ${a.label}`.localeCompare(`${b.number ?? ""} ${b.label}`, "en-CA", { numeric: true });
    }
    const left = sortValue(a, sort.key, previous);
    const right = sortValue(b, sort.key, previous);
    if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
    return direction * (left - right);
  });
}

/** Two days before today is the latest the live slice can make up for. */
export function derivationIsBehind(availability: AnalyticsAvailability): boolean {
  return Boolean(availability.firstAnalyzableDate && availability.derivedThrough
    && availability.derivedThrough < addServiceDays(availability.today, -2));
}

export function showsSlowZones(networkId: AnalyticsNetworkId, summary: AnalyticsSummary | null): boolean {
  if (networkId === "ttc") return true;
  const slowZones = summary && classMetric(summary.totals, "slow-zone");
  return Boolean(slowZones && (slowZones.incidents > 0 || slowZones.uniqueMinutes > 0));
}
