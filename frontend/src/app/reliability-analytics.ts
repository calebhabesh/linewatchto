import type { DisruptionClassMetricItem } from "./linewatch-data.ts";
import {
  addServiceDays,
  formatServiceDateRange,
  serviceDayCount,
  type AnalyticsDrilldown,
  type AnalyticsLineOption,
  type ResolvedAnalyticsRange,
} from "./reliability-range.ts";

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

export type AnalyticsAlertBreakdown = {
  impactKind: string;
  label: string;
  incidents: number;
  incidentDisruptionMinutes: number;
  percentage: number;
};

export type AnalyticsCauseBreakdown = {
  cause: string;
  label: string;
  incidents: number;
  incidentDisruptionMinutes: number;
  percentage: number;
};

export type AnalyticsTrainCancellationMetric = {
  id: string;
  number: string | null;
  label: string;
  cancellations: number;
  scheduleMatchedCancellations: number;
};

export type AnalyticsTrainCancellationSummary = {
  cancellations: number;
  scheduleMatchedCancellations: number;
  sourceLabeledCancellations: number;
  observationMinutes: number;
  coveragePercentage: number;
  confidence: AnalyticsConfidence;
  message: string;
  corridors: AnalyticsTrainCancellationMetric[];
};

export type AnalyticsDurationBucket = {
  id: string;
  label: string;
  minMinutes: number;
  maxMinutes: number | null;
  unplanned: number;
  planned: number;
  total: number;
};

export type AnalyticsDurationStats = {
  clearedCount: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
};

export type AnalyticsDurationDistribution = {
  all: AnalyticsDurationStats;
  unplanned: AnalyticsDurationStats;
  planned: AnalyticsDurationStats;
  buckets: AnalyticsDurationBucket[];
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
  breakdown?: AnalyticsAlertBreakdown[];
  causes?: AnalyticsCauseBreakdown[];
  trainCancellations?: AnalyticsTrainCancellationSummary | null;
  durations?: AnalyticsDurationDistribution | null;
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

export type AnalyticsGranularity = "day" | "week" | "month";

export type AnalyticsSeriesLineMetric = {
  lineId: string;
  number: string | null;
  label: string;
  observedMinutes: number;
  uniqueMinutes: number | null;
  weightedMinutes: number | null;
  weightedSharePercentage: number | null;
  serviceStoppedShare: number | null;
  delayShare: number | null;
  slowZoneShare: number | null;
};

export type AnalyticsSeriesBucket = {
  from: string;
  to: string;
  days: number;
  analyzableDays: number;
  pollingPercentage: number;
  schedulePercentage: number;
  confidence: AnalyticsConfidence;
  observedMinutes: number;
  uniqueMinutes: number | null;
  weightedMinutes: number | null;
  weightedSharePercentage: number | null;
  incidents: number | null;
  classes: DisruptionClassMetricItem[];
  includesToday: boolean;
  lines?: AnalyticsSeriesLineMetric[];
};

export type AnalyticsSeriesResponse = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: AnalyticsSummary["range"];
  granularity: AnalyticsGranularity;
  scope: "network" | "line" | "station";
  lineId: string | null;
  stationId: string | null;
  buckets: AnalyticsSeriesBucket[];
  message: string;
};

export type AnalyticsPatternCell = {
  dayOfWeek: number;
  hour: number;
  observedMinutes: number;
  anyAlertMinutes: number;
  classMinutes: Record<string, number>;
};

export type AnalyticsPatternsResponse = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: AnalyticsSummary["range"];
  scope: "network" | "line" | "station";
  lineId: string | null;
  stationId: string | null;
  timeZone: string;
  cells: AnalyticsPatternCell[];
  message: string;
};

export type AnalyticsHotspot = {
  rank: number;
  stationId: string;
  stationName: string;
  lineId: string;
  lineNumber: string | null;
  lineLabel: string;
  observedMinutes: number;
  uniqueMinutes: number;
  weightedMinutes: number;
  sharePercentage: number;
  incidents: number;
  classes: DisruptionClassMetricItem[];
};

export type AnalyticsHotspotsResponse = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: AnalyticsSummary["range"];
  lineId: string | null;
  disruptionClass: DisruptionClassId | null;
  sort: "minutes" | "incidents";
  limit: number;
  stations: AnalyticsHotspot[];
  message: string;
};

export type AnalyticsEpisodeItem = {
  id: string;
  alertId: string;
  lineId: string;
  lineNumber: string | null;
  lineLabel: string;
  disruptionClass: DisruptionClassId | string;
  classLabel: string;
  impactKind: string;
  kindLabel: string;
  planned: boolean;
  cause: string | null;
  causeLabel: string | null;
  title: string;
  stationIds: string[];
  openedAt: string;
  closedAt: string | null;
  countedMinutes: number;
  active: boolean;
};

export type AnalyticsEpisodesResponse = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: AnalyticsSummary["range"];
  lineId: string | null;
  stationId: string | null;
  limit: number;
  totalCount: number;
  sort: "recent" | "longest";
  episodes: AnalyticsEpisodeItem[];
  nextCursor: string | null;
  message: string;
};

export type AnalyticsCancellationCoverage = {
  observationMinutes: number;
  coveragePercentage: number;
  confidence: AnalyticsConfidence;
  trackedDays: number;
  totalDays: number;
  label: string;
};

export type AnalyticsCancellationCorridorBucket = {
  lineId: string;
  number: string | null;
  label: string;
  cancellations: number;
  scheduleMatchedCancellations: number;
};

export type AnalyticsCancellationBucket = {
  from: string;
  to: string;
  days: number;
  trackedDays: number;
  coveragePercentage: number;
  confidence: AnalyticsConfidence;
  cancellations: number | null;
  scheduleMatchedCancellations: number | null;
  corridors: AnalyticsCancellationCorridorBucket[];
  includesToday: boolean;
};

export type AnalyticsCancellationsResponse = {
  networkId: AnalyticsNetworkId;
  methodologyVersion: number;
  range: AnalyticsSummary["range"];
  granularity: AnalyticsGranularity;
  lineId: string | null;
  stationId: string | null;
  trackingStartedAt: string | null;
  coverage: AnalyticsCancellationCoverage;
  totals: AnalyticsTrainCancellationSummary | null;
  buckets: AnalyticsCancellationBucket[];
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

export const MAX_SERIES_BUCKETS = 400;
export const MAX_CALENDAR_DAYS = 366;
export const MAX_EXPORT_ROWS = 20_000;

export const CLASS_LABELS: Record<DisruptionClassId, string> = {
  "service-stopped": "Service Stopped",
  delay: "Delays",
  "slow-zone": "Slow Zones",
};

const KIND_LABELS: Record<string, string> = {
  suspension: "Suspensions",
  closure: "Closures",
  "planned-closure": "Planned Advisories",
  delay: "Delays",
  "limited-service": "Limited Service",
  "reduced-speed-zone": "Reduced Speed Zones",
};

export const DAY_OF_WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function defaultSeriesGranularity(days: number): AnalyticsGranularity {
  if (days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

export function granularityAllowed(days: number, granularity: AnalyticsGranularity): boolean {
  if (granularity === "day") return days <= MAX_SERIES_BUCKETS;
  if (granularity === "week") return Math.ceil(days / 7) + 1 <= MAX_SERIES_BUCKETS;
  return Math.ceil(days / 28) + 2 <= MAX_SERIES_BUCKETS;
}

/** Calendar shows at most 366 days ending at `to`, staying well within the 400-bucket API cap. */
export function calendarRange(from: string, to: string): { from: string; to: string; days: number; capped: boolean } {
  const total = serviceDayCount(from, to);
  if (total <= MAX_CALENDAR_DAYS) return { from, to, days: total, capped: false };
  return { from: addServiceDays(to, -(MAX_CALENDAR_DAYS - 1)), to, days: MAX_CALENDAR_DAYS, capped: true };
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function formatHourOfWeek(dayOfWeek: number, hour: number): string {
  const day = DAY_OF_WEEK_LABELS[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
  return `${day} · ${formatHourLabel(hour)}`;
}

export function formatCauseLabel(cause: string): string {
  return cause
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/** Maps a share or ratio (0..max) into 5 discrete intensity levels (0 = none, 1..4 = rising). */
export function intensityLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export type DrilldownChip = {
  id: string;
  label: string;
  clear: (current: AnalyticsDrilldown) => AnalyticsDrilldown;
};

export function describeDrilldown(
  drilldown: AnalyticsDrilldown,
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
): DrilldownChip[] {
  const chips: DrilldownChip[] = [];
  if (drilldown.from) {
    chips.push({
      id: "dates",
      label: formatServiceDateRange(drilldown.from, drilldown.to ?? drilldown.from),
      clear: (current) => ({ ...current, from: null, to: null }),
    });
  }
  if (drilldown.line) {
    const line = lines.find((item) => item.id === drilldown.line);
    const label = line
      ? (networkId === "ttc" ? `Line ${line.number} ${line.name}` : line.name)
      : drilldown.line;
    chips.push({
      id: "line",
      label,
      clear: (current) => ({ ...current, line: null, station: null }),
    });
  }
  if (drilldown.station) {
    const station = lines.flatMap((line) => line.stations).find((item) => item.id === drilldown.station);
    chips.push({
      id: "station",
      label: station?.name ?? drilldown.station,
      clear: (current) => ({ ...current, station: null }),
    });
  }
  if (drilldown.disruptionClass) {
    chips.push({
      id: "class",
      label: CLASS_LABELS[drilldown.disruptionClass],
      clear: (current) => ({ ...current, disruptionClass: null }),
    });
  }
  if (drilldown.kind) {
    chips.push({
      id: "kind",
      label: KIND_LABELS[drilldown.kind] ?? drilldown.kind,
      clear: (current) => ({ ...current, kind: null }),
    });
  }
  if (drilldown.cause) {
    chips.push({
      id: "cause",
      label: formatCauseLabel(drilldown.cause),
      clear: (current) => ({ ...current, cause: null }),
    });
  }
  if (drilldown.planned !== null) {
    chips.push({
      id: "planned",
      label: drilldown.planned ? "Planned" : "Unplanned",
      clear: (current) => ({ ...current, planned: null }),
    });
  }
  if (drilldown.minMinutes !== null || drilldown.maxMinutes !== null) {
    const minText = drilldown.minMinutes !== null ? formatMinutes(drilldown.minMinutes) : "1 min";
    const label = drilldown.maxMinutes !== null
      ? `${minText} – ${formatMinutes(drilldown.maxMinutes)}`
      : `${minText}+`;
    chips.push({
      id: "duration",
      label: `Cleared: ${label}`,
      clear: (current) => ({ ...current, minMinutes: null, maxMinutes: null, completed: null }),
    });
  } else if (drilldown.completed !== null) {
    chips.push({
      id: "completed",
      label: drilldown.completed ? "Cleared Only" : "Active Only",
      clear: (current) => ({ ...current, completed: null }),
    });
  }
  if (drilldown.dayOfWeek !== null || drilldown.hour !== null) {
    const label = drilldown.dayOfWeek !== null && drilldown.hour !== null
      ? formatHourOfWeek(drilldown.dayOfWeek, drilldown.hour)
      : drilldown.dayOfWeek !== null
        ? DAY_OF_WEEK_LABELS[drilldown.dayOfWeek - 1]
        : formatHourLabel(drilldown.hour!);
    chips.push({
      id: "hour",
      label,
      clear: (current) => ({ ...current, dayOfWeek: null, hour: null }),
    });
  }
  if (drilldown.sort === "longest") {
    chips.push({
      id: "sort",
      label: "Sort: Longest Counted",
      clear: (current) => ({ ...current, sort: "recent" }),
    });
  }
  return chips;
}

export function buildExportPath(
  networkId: AnalyticsNetworkId,
  from: string,
  to: string,
  line: string | null,
  station: string | null,
): string {
  const params = new URLSearchParams({ network: networkId, from, to });
  if (line) params.set("line", line);
  if (line && station) params.set("station", station);
  return `/api/reliability/export?${params.toString()}`;
}

export function buildEpisodesPath(
  networkId: AnalyticsNetworkId,
  from: string,
  to: string,
  line: string | null,
  station: string | null,
  drilldown: AnalyticsDrilldown,
  options: { cursor?: string | null; limit?: number } = {},
): string {
  const effectiveFrom = drilldown.from && drilldown.from >= from && drilldown.from <= to ? drilldown.from : from;
  const effectiveTo = drilldown.to && drilldown.to >= effectiveFrom && drilldown.to <= to ? drilldown.to : (drilldown.from ? effectiveFrom : to);
  const effectiveLine = drilldown.line ?? line;
  const effectiveStation = drilldown.station ?? (effectiveLine === line ? station : null);
  const params = new URLSearchParams({ network: networkId, from: effectiveFrom, to: effectiveTo });
  if (effectiveLine) params.set("line", effectiveLine);
  if (effectiveStation) params.set("station", effectiveStation);
  if (drilldown.disruptionClass) params.set("class", drilldown.disruptionClass);
  if (drilldown.kind) params.set("kind", drilldown.kind);
  if (drilldown.cause) params.set("cause", drilldown.cause);
  if (drilldown.planned !== null) params.set("planned", String(drilldown.planned));
  if (drilldown.completed !== null) params.set("completed", String(drilldown.completed));
  if (drilldown.minMinutes !== null) params.set("minMinutes", String(drilldown.minMinutes));
  if (drilldown.maxMinutes !== null) params.set("maxMinutes", String(drilldown.maxMinutes));
  if (drilldown.dayOfWeek !== null) params.set("dayOfWeek", String(drilldown.dayOfWeek));
  if (drilldown.hour !== null) params.set("hour", String(drilldown.hour));
  if (drilldown.sort !== "recent") params.set("sort", drilldown.sort);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  return `/api/reliability/episodes?${params.toString()}`;
}
