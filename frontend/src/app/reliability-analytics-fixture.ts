import type {
  AnalyticsAlertBreakdown,
  AnalyticsAvailability,
  AnalyticsCancellationBucket,
  AnalyticsCancellationsResponse,
  AnalyticsCauseBreakdown,
  AnalyticsDurationDistribution,
  AnalyticsEpisodeItem,
  AnalyticsEpisodesResponse,
  AnalyticsGranularity,
  AnalyticsHotspot,
  AnalyticsHotspotsResponse,
  AnalyticsNetworkId,
  AnalyticsPatternCell,
  AnalyticsPatternsResponse,
  AnalyticsRow,
  AnalyticsSeriesBucket,
  AnalyticsSeriesLineMetric,
  AnalyticsSeriesResponse,
  AnalyticsSummary,
  AnalyticsTotals,
  AnalyticsTrainCancellationSummary,
  DisruptionClassId,
} from "./reliability-analytics.ts";
import {
  addServiceDays,
  serviceDayCount,
  type AnalyticsDrilldown,
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

const DEMO_CAUSES = [
  { cause: "MEDICAL_EMERGENCY", label: "Medical Emergency", weight: 0.30 },
  { cause: "POLICE_ACTIVITY", label: "Police Activity", weight: 0.25 },
  { cause: "TECHNICAL_PROBLEM", label: "Technical Problem", weight: 0.22 },
  { cause: "MAINTENANCE", label: "Maintenance", weight: 0.13 },
  { cause: "OTHER_CAUSE", label: "Other Cause", weight: 0.10 },
] as const;

const DURATION_BINS = [
  { id: "under-15", label: "< 15 min", minMinutes: 1, maxMinutes: 14, unplanned: 0.32, planned: 0.0 },
  { id: "15-29", label: "15–29 min", minMinutes: 15, maxMinutes: 29, unplanned: 0.28, planned: 0.05 },
  { id: "30-59", label: "30–59 min", minMinutes: 30, maxMinutes: 59, unplanned: 0.20, planned: 0.10 },
  { id: "60-119", label: "1–2 hr", minMinutes: 60, maxMinutes: 119, unplanned: 0.11, planned: 0.20 },
  { id: "120-239", label: "2–4 hr", minMinutes: 120, maxMinutes: 239, unplanned: 0.05, planned: 0.30 },
  { id: "240-719", label: "4–12 hr", minMinutes: 240, maxMinutes: 719, unplanned: 0.03, planned: 0.25 },
  { id: "720-plus", label: "12+ hr", minMinutes: 720, maxMinutes: null, unplanned: 0.01, planned: 0.10 },
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

function demoBreakdown(networkId: AnalyticsNetworkId, totals: AnalyticsTotals): AnalyticsAlertBreakdown[] {
  const stopped = totals.classes.find((c) => c.disruptionClass === "service-stopped");
  const delay = totals.classes.find((c) => c.disruptionClass === "delay");
  const slow = totals.classes.find((c) => c.disruptionClass === "slow-zone");
  const items: Array<{ impactKind: string; label: string; incidents: number; minutes: number }> = [
    {
      impactKind: "delay",
      label: "Delays",
      incidents: delay?.incidents ?? 0,
      minutes: delay?.incidentDisruptionMinutes ?? 0,
    },
    {
      impactKind: "suspension",
      label: "Suspensions",
      incidents: Math.max(0, Math.round((stopped?.incidents ?? 0) * 0.72)),
      minutes: Math.round((stopped?.incidentDisruptionMinutes ?? 0) * 0.58),
    },
    {
      impactKind: "planned-closure",
      label: "Planned Advisories",
      incidents: Math.max(0, (stopped?.incidents ?? 0) - Math.round((stopped?.incidents ?? 0) * 0.72)),
      minutes: Math.round((stopped?.incidentDisruptionMinutes ?? 0) * 0.42),
    },
  ];
  if (networkId === "ttc" && slow && (slow.incidents > 0 || slow.incidentDisruptionMinutes > 0)) {
    items.push({
      impactKind: "reduced-speed-zone",
      label: "Reduced Speed Zones",
      incidents: slow.incidents,
      minutes: slow.incidentDisruptionMinutes,
    });
  }
  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0) || 1;
  return items
    .filter((item) => item.incidents > 0 || item.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((item) => ({
      impactKind: item.impactKind,
      label: item.label,
      incidents: item.incidents,
      incidentDisruptionMinutes: item.minutes,
      percentage: Math.round(item.minutes * 1000 / totalMinutes) / 10,
    }));
}

function demoCauses(totals: AnalyticsTotals): AnalyticsCauseBreakdown[] {
  const totalIncidents = Math.max(1, totals.incidents);
  const totalMinutes = Math.max(1, totals.incidentDisruptionMinutes);
  return DEMO_CAUSES.map((item) => ({
    cause: item.cause,
    label: item.label,
    incidents: Math.max(1, Math.round(totalIncidents * item.weight)),
    incidentDisruptionMinutes: Math.round(totalMinutes * item.weight),
    percentage: Math.round(item.weight * 1000) / 10,
  }));
}

function demoDurations(totals: AnalyticsTotals): AnalyticsDurationDistribution {
  const clearedTotal = Math.max(0, totals.incidents - totals.activeIncidents);
  const plannedTotal = Math.max(0, Math.round(clearedTotal * 0.16));
  const unplannedTotal = Math.max(0, clearedTotal - plannedTotal);
  const buckets = DURATION_BINS.map((bin) => {
    const unplanned = Math.round(unplannedTotal * bin.unplanned);
    const planned = Math.round(plannedTotal * bin.planned);
    return {
      id: bin.id,
      label: bin.label,
      minMinutes: bin.minMinutes,
      maxMinutes: bin.maxMinutes,
      unplanned,
      planned,
      total: unplanned + planned,
    };
  });
  const totalCount = buckets.reduce((sum, b) => sum + b.total, 0);
  const uCount = buckets.reduce((sum, b) => sum + b.unplanned, 0);
  const pCount = buckets.reduce((sum, b) => sum + b.planned, 0);
  return {
    all: {
      clearedCount: totalCount,
      medianMinutes: totalCount > 0 ? totals.medianTimeToClearMinutes ?? 18 : null,
      p90Minutes: totalCount > 0 ? totals.p90TimeToClearMinutes ?? 95 : null,
    },
    unplanned: {
      clearedCount: uCount,
      medianMinutes: uCount > 0 ? Math.max(8, (totals.medianTimeToClearMinutes ?? 18) - 3) : null,
      p90Minutes: uCount > 0 ? Math.max(30, Math.round((totals.p90TimeToClearMinutes ?? 95) * 0.72)) : null,
    },
    planned: {
      clearedCount: pCount,
      medianMinutes: pCount > 0 ? 185 : null,
      p90Minutes: pCount > 0 ? 540 : null,
    },
    buckets,
  };
}

function demoTrainCancellations(
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  days: number,
  polling: number,
): AnalyticsTrainCancellationSummary {
  const scoped = query.line ? lines.filter((line) => line.id === query.line) : lines;
  const corridors = scoped.map((line, index) => {
    const count = Math.max(0, Math.round((days / 6) * (0.4 + ((index * 3 + 1) % 4) * 0.45)));
    return {
      id: line.id,
      number: line.number,
      label: line.name,
      cancellations: count,
      scheduleMatchedCancellations: Math.round(count * 0.8),
    };
  }).filter((item) => item.cancellations > 0);
  const total = corridors.reduce((sum, item) => sum + item.cancellations, 0);
  const matched = corridors.reduce((sum, item) => sum + item.scheduleMatchedCancellations, 0);
  return {
    cancellations: total,
    scheduleMatchedCancellations: matched,
    sourceLabeledCancellations: total - matched,
    observationMinutes: Math.round(days * 1_440 * polling / 100),
    coveragePercentage: Math.round(polling * 10) / 10,
    confidence: polling >= 95 ? "high" : polling >= 75 ? "medium" : "low",
    message: "Demo train cancellation summary.",
    corridors,
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
  const computedTotals = totals(rows);
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
    totals: computedTotals,
    rows,
    breakdown: demoBreakdown(networkId, computedTotals),
    causes: networkId === "ttc" ? demoCauses(computedTotals) : [],
    trainCancellations: networkId === "regional" ? demoTrainCancellations(lines, query, days, polling) : null,
    durations: demoDurations(computedTotals),
    previous: hasPrevious
      ? { from: previousFrom, to: previousTo, coverage, totals: totals(previousRows), rows: line ? [] : previousRows }
      : null,
    previousUnavailableReason: hasPrevious
      ? null
      : `The previous ${days} days start before history starts on ${availability.firstAnalyzableDate}.`,
    message: "Demo data. These numbers are invented and do not describe any service.",
  };
}

function buildBuckets(from: string, to: string, granularity: AnalyticsGranularity): Array<[string, string]> {
  const buckets: Array<[string, string]> = [];
  let cursor = from;
  while (cursor <= to && buckets.length < 400) {
    let end = cursor;
    if (granularity === "week") {
      const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
      const daysToSunday = dow === 0 ? 0 : 7 - dow;
      end = addServiceDays(cursor, daysToSunday);
    } else if (granularity === "month") {
      const d = new Date(`${cursor}T00:00:00Z`);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      end = `${cursor.slice(0, 8)}${String(last).padStart(2, "0")}`;
    }
    if (end > to) end = to;
    buckets.push([cursor, end]);
    cursor = addServiceDays(end, 1);
  }
  return buckets;
}

export function demoSeries(
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
  granularity: AnalyticsGranularity,
  byLine = false,
): AnalyticsSeriesResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const byDate = new Map(availability.days.map((day) => [day.date, day]));
  const scopedLines = query.line ? lines.filter((item) => item.id === query.line) : lines;
  const buckets: AnalyticsSeriesBucket[] = buildBuckets(from, to, granularity).map(([bucketFrom, bucketTo], bucketIdx) => {
    const dates: string[] = [];
    for (let d = bucketFrom; d <= bucketTo; d = addServiceDays(d, 1)) dates.push(d);
    const dayInfos = dates.map((d) => byDate.get(d));
    const analyzableDays = dayInfos.filter((d) => d?.analyzable).length;
    const polling = dayInfos.reduce((sum, d) => sum + (d?.pollingPercentage ?? 0), 0) / Math.max(1, dates.length);
    const schedulePct = dayInfos.filter((d) => d?.scheduleDay).length / Math.max(1, dates.length) * 100;
    const effective = Math.min(polling, schedulePct);
    const confidence = effective >= 95 ? "high" as const : effective >= 75 ? "medium" as const : "low" as const;
    const includesToday = dates.includes(availability.today);
    if (analyzableDays === 0) {
      return {
        from: bucketFrom, to: bucketTo, days: dates.length, analyzableDays: 0,
        pollingPercentage: Math.round(polling * 10) / 10, schedulePercentage: Math.round(schedulePct * 10) / 10,
        confidence, observedMinutes: 0, uniqueMinutes: null, weightedMinutes: null, weightedSharePercentage: null,
        incidents: null, classes: [], includesToday, lines: [],
      };
    }
    const observed = analyzableDays * 1_080 * (query.station ? 1 : scopedLines.length);
    const wave = 0.6 + ((bucketIdx * 11 + 3) % 7) * 0.25;
    const stoppedMin = Math.round(analyzableDays * (18 * wave) * (bucketIdx % 3 === 0 ? 1.8 : 0.7));
    const delayMin = Math.round(analyzableDays * (34 * wave));
    const slowMin = networkId === "ttc" ? Math.round(analyzableDays * (62 + (bucketIdx % 4) * 18)) : 0;
    const classes = [
      {
        disruptionClass: "service-stopped", label: "Service Stopped",
        incidents: stoppedMin > 0 ? Math.max(1, Math.round(stoppedMin / 45)) : 0, activeIncidents: 0,
        uniqueMinutes: stoppedMin * 2, weightedMinutes: stoppedMin,
        weightedSharePercentage: Math.round(stoppedMin * 1000 / Math.max(1, observed)) / 10,
        incidentDisruptionMinutes: stoppedMin * 2,
      },
      {
        disruptionClass: "delay", label: "Delays",
        incidents: Math.max(1, Math.round(delayMin / 22)), activeIncidents: 0,
        uniqueMinutes: delayMin * 2, weightedMinutes: delayMin,
        weightedSharePercentage: Math.round(delayMin * 1000 / Math.max(1, observed)) / 10,
        incidentDisruptionMinutes: delayMin * 2,
      },
      {
        disruptionClass: "slow-zone", label: "Slow Zones",
        incidents: networkId === "ttc" ? (2 + (bucketIdx % 4)) : 0, activeIncidents: 0,
        uniqueMinutes: slowMin * 2, weightedMinutes: slowMin,
        weightedSharePercentage: Math.round(slowMin * 1000 / Math.max(1, observed)) / 10,
        incidentDisruptionMinutes: slowMin * 2,
      },
    ];
    const weighted = stoppedMin + delayMin + slowMin;
    const unique = Math.min(observed, Math.round(weighted * 2.1));
    const lineMetrics: AnalyticsSeriesLineMetric[] = byLine && !query.station
      ? scopedLines.map((line, lineIdx) => {
          const lineObs = analyzableDays * 1_080;
          const factor = 0.25 + (((bucketIdx + 1) * (lineIdx + 3)) % 6) * 0.32;
          const lStopped = Math.round(stoppedMin / scopedLines.length * factor);
          const lDelay = Math.round(delayMin / scopedLines.length * factor);
          const lSlow = networkId === "ttc" && lineIdx < 2 ? Math.round(slowMin / 2 * factor) : 0;
          const lWeight = lStopped + lDelay + lSlow;
          return {
            lineId: line.id,
            number: line.number,
            label: line.name,
            observedMinutes: lineObs,
            uniqueMinutes: Math.min(lineObs, Math.round(lWeight * 2)),
            weightedMinutes: lWeight,
            weightedSharePercentage: Math.round(lWeight * 1000 / lineObs) / 10,
            serviceStoppedShare: Math.round(lStopped * 1000 / lineObs) / 10,
            delayShare: Math.round(lDelay * 1000 / lineObs) / 10,
            slowZoneShare: Math.round(lSlow * 1000 / lineObs) / 10,
          };
        })
      : [];
    return {
      from: bucketFrom, to: bucketTo, days: dates.length, analyzableDays,
      pollingPercentage: Math.round(polling * 10) / 10, schedulePercentage: Math.round(schedulePct * 10) / 10,
      confidence, observedMinutes: observed, uniqueMinutes: unique, weightedMinutes: weighted,
      weightedSharePercentage: Math.round(weighted * 1000 / Math.max(1, observed)) / 10,
      incidents: classes.reduce((sum, c) => sum + c.incidents, 0),
      classes, includesToday, lines: lineMetrics,
    };
  });
  return {
    networkId, methodologyVersion: 2,
    range: { from, to, days: serviceDayCount(from, to), firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: to === availability.today },
    granularity,
    scope: query.station ? "station" : query.line ? "line" : "network",
    lineId: query.line, stationId: query.station,
    buckets,
    message: "Demo series data.",
  };
}

export function demoPatterns(
  networkId: AnalyticsNetworkId,
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
): AnalyticsPatternsResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const days = serviceDayCount(from, to);
  const weeks = Math.max(1, Math.round(days / 7));
  const cells: AnalyticsPatternCell[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const weekday = dow <= 5;
    for (let hour = 0; hour < 24; hour++) {
      const closed = hour >= 2 && hour <= 4;
      if (closed) {
        cells.push({ dayOfWeek: dow, hour, observedMinutes: 0, anyAlertMinutes: 0, classMinutes: { "service-stopped": 0, delay: 0, "slow-zone": 0 } });
        continue;
      }
      const observed = weeks * 60 * (query.line ? 1 : 4);
      const peak = weekday && ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) ? 2.4 : weekday ? 1.0 : 0.65;
      const stopped = Math.round(observed * 0.015 * peak * ((dow + hour) % 3 === 0 ? 1.4 : 0.7));
      const delay = Math.round(observed * 0.035 * peak * (0.7 + ((dow * 5 + hour) % 5) * 0.15));
      const slow = networkId === "ttc" ? Math.round(observed * 0.06 * (hour >= 6 ? 1 : 0.4)) : 0;
      const any = Math.min(observed, stopped + delay + slow);
      cells.push({
        dayOfWeek: dow, hour, observedMinutes: observed, anyAlertMinutes: any,
        classMinutes: { "service-stopped": stopped, delay, "slow-zone": slow },
      });
    }
  }
  return {
    networkId, methodologyVersion: 2,
    range: { from, to, days, firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: to === availability.today },
    scope: query.station ? "station" : query.line ? "line" : "network",
    lineId: query.line, stationId: query.station,
    timeZone: "America/Toronto",
    cells,
    message: "Demo hour-of-week patterns.",
  };
}

export function demoHotspots(
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
  disruptionClass: DisruptionClassId | null,
  sort: "minutes" | "incidents",
  limit = 12,
): AnalyticsHotspotsResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const days = serviceDayCount(from, to);
  const scopedLines = query.line ? lines.filter((l) => l.id === query.line) : lines;
  const raw: Omit<AnalyticsHotspot, "rank">[] = [];
  scopedLines.forEach((line, lIdx) => {
    line.stations.slice(0, 8).forEach((station, sIdx) => {
      if (query.station && station.id !== query.station) return;
      const obs = days * 1_080;
      const seed = (lIdx + 1) * 7 + (sIdx + 1) * 3;
      const stoppedMin = Math.round(days * (4 + (seed % 9) * 3.5));
      const delayMin = Math.round(days * (8 + ((seed * 3) % 11) * 4));
      const slowMin = networkId === "ttc" && lIdx === 0 ? Math.round(days * (90 + (sIdx % 4) * 35)) : 0;
      const stoppedInc = Math.max(1, Math.round(stoppedMin / 35));
      const delayInc = Math.max(1, Math.round(delayMin / 20));
      const slowInc = slowMin > 0 ? Math.max(1, Math.round(slowMin / 220)) : 0;
      const minutes = disruptionClass === "service-stopped" ? stoppedMin
        : disruptionClass === "delay" ? delayMin
        : disruptionClass === "slow-zone" ? slowMin
        : Math.min(obs, stoppedMin + delayMin + slowMin);
      const incidents = disruptionClass === "service-stopped" ? stoppedInc
        : disruptionClass === "delay" ? delayInc
        : disruptionClass === "slow-zone" ? slowInc
        : stoppedInc + delayInc + slowInc;
      if (minutes <= 0 && incidents <= 0) return;
      raw.push({
        stationId: station.id,
        stationName: station.name,
        lineId: line.id,
        lineNumber: line.number,
        lineLabel: line.name,
        observedMinutes: obs,
        uniqueMinutes: minutes,
        weightedMinutes: minutes,
        sharePercentage: Math.round(minutes * 1000 / Math.max(1, obs)) / 10,
        incidents,
        classes: [
          { disruptionClass: "service-stopped", label: "Service Stopped", incidents: stoppedInc, activeIncidents: 0, uniqueMinutes: stoppedMin, weightedMinutes: stoppedMin, weightedSharePercentage: Math.round(stoppedMin * 1000 / obs) / 10, incidentDisruptionMinutes: stoppedMin },
          { disruptionClass: "delay", label: "Delays", incidents: delayInc, activeIncidents: 0, uniqueMinutes: delayMin, weightedMinutes: delayMin, weightedSharePercentage: Math.round(delayMin * 1000 / obs) / 10, incidentDisruptionMinutes: delayMin },
          { disruptionClass: "slow-zone", label: "Slow Zones", incidents: slowInc, activeIncidents: 0, uniqueMinutes: slowMin, weightedMinutes: slowMin, weightedSharePercentage: Math.round(slowMin * 1000 / obs) / 10, incidentDisruptionMinutes: slowMin },
        ],
      });
    });
  });
  raw.sort((a, b) => sort === "incidents"
    ? (b.incidents - a.incidents || b.weightedMinutes - a.weightedMinutes)
    : (b.weightedMinutes - a.weightedMinutes || b.incidents - a.incidents));
  return {
    networkId, methodologyVersion: 2,
    range: { from, to, days, firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: to === availability.today },
    lineId: query.line, disruptionClass, sort, limit,
    stations: raw.slice(0, limit).map((item, idx) => ({ ...item, rank: idx + 1 })),
    message: "Demo station hotspots.",
  };
}

export function demoEpisodes(
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
  drilldown: AnalyticsDrilldown,
  cursor: string | null = null,
  limit = 25,
): AnalyticsEpisodesResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const effectiveFrom = drilldown.from && drilldown.from >= from && drilldown.from <= to ? drilldown.from : from;
  const effectiveTo = drilldown.to && drilldown.to >= effectiveFrom && drilldown.to <= to ? drilldown.to : (drilldown.from ? effectiveFrom : to);
  const effectiveLine = drilldown.line ?? query.line;
  const effectiveStation = drilldown.station ?? (effectiveLine === query.line ? query.station : null);

  const scopedLines = effectiveLine ? lines.filter((l) => l.id === effectiveLine) : lines;
  const catalog = scopedLines.length ? scopedLines : lines;
  const all: AnalyticsEpisodeItem[] = [];
  const totalDays = Math.min(45, serviceDayCount(effectiveFrom, effectiveTo));
  const specs: Array<{ cls: DisruptionClassId; clsLabel: string; kind: string; kindLabel: string; planned: boolean; mins: number; active: boolean; cause: string | null }> = networkId === "ttc"
    ? [
        { cls: "service-stopped", clsLabel: "Service Stopped", kind: "suspension", kindLabel: "Suspension", planned: false, mins: 38, active: false, cause: "MEDICAL_EMERGENCY" },
        { cls: "delay", clsLabel: "Delays", kind: "delay", kindLabel: "Delay", planned: false, mins: 22, active: false, cause: "TECHNICAL_PROBLEM" },
        { cls: "slow-zone", clsLabel: "Slow Zones", kind: "reduced-speed-zone", kindLabel: "Reduced Speed Zone", planned: false, mins: 840, active: true, cause: "MAINTENANCE" },
        { cls: "service-stopped", clsLabel: "Service Stopped", kind: "planned-closure", kindLabel: "Planned Advisory", planned: true, mins: 240, active: false, cause: "MAINTENANCE" },
        { cls: "delay", clsLabel: "Delays", kind: "delay", kindLabel: "Delay", planned: false, mins: 14, active: false, cause: "POLICE_ACTIVITY" },
      ]
    : [
        { cls: "delay", clsLabel: "Delays", kind: "delay", kindLabel: "Delay", planned: false, mins: 26, active: false, cause: null },
        { cls: "service-stopped", clsLabel: "Service Stopped", kind: "suspension", kindLabel: "Suspension", planned: false, mins: 54, active: false, cause: null },
        { cls: "service-stopped", clsLabel: "Service Stopped", kind: "planned-closure", kindLabel: "Planned Advisory", planned: true, mins: 310, active: false, cause: null },
        { cls: "delay", clsLabel: "Delays", kind: "delay", kindLabel: "Delay", planned: false, mins: 12, active: false, cause: null },
      ];

  for (let i = 0; i < Math.max(12, totalDays * 2); i++) {
    const line = catalog[i % catalog.length];
    const spec = specs[i % specs.length];
    const station = effectiveStation
      ? line.stations.find((s) => s.id === effectiveStation) ?? line.stations[0]
      : line.stations[i % Math.max(1, line.stations.length)];
    const dayOffset = Math.min(Math.max(0, totalDays - 1), Math.floor(i / 2));
    const date = addServiceDays(effectiveTo, -dayOffset);
    const hour = (7 + (i * 3)) % 16 + 6; // 06..21
    const openedIso = `${date}T${String(hour).padStart(2, "0")}:15:00-05:00`;
    const mins = spec.mins + (i % 5) * 12;
    const closedDate = new Date(Date.parse(openedIso) + mins * 60_000);
    const isActive = spec.active && i < 3;
    const causeLabel = spec.cause ? DEMO_CAUSES.find((c) => c.cause === spec.cause)?.label ?? null : null;
    const titlePrefix = networkId === "ttc" ? `Line ${line.number}` : line.name;
    all.push({
      id: `demo-${networkId}-${i}`,
      alertId: `demo-alert-${i}`,
      lineId: line.id,
      lineNumber: line.number,
      lineLabel: line.name,
      disruptionClass: spec.cls,
      classLabel: spec.clsLabel,
      impactKind: spec.kind,
      kindLabel: spec.kindLabel,
      planned: spec.planned,
      cause: spec.cause,
      causeLabel,
      title: `${titlePrefix}: ${spec.kindLabel}${station ? ` near ${station.name}` : ""} (Demo)`,
      stationIds: station ? [station.id] : [],
      openedAt: openedIso,
      closedAt: isActive ? null : closedDate.toISOString(),
      countedMinutes: mins,
      active: isActive,
    });
  }

  const filtered = all.filter((ep) => {
    if (drilldown.disruptionClass && ep.disruptionClass !== drilldown.disruptionClass) return false;
    if (drilldown.kind && ep.impactKind !== drilldown.kind) return false;
    if (drilldown.cause && (ep.cause ?? "UNKNOWN_CAUSE") !== drilldown.cause) return false;
    if (drilldown.planned !== null && ep.planned !== drilldown.planned) return false;
    if (drilldown.completed !== null && (ep.closedAt !== null) !== drilldown.completed) return false;
    if (drilldown.minMinutes !== null && ep.countedMinutes < drilldown.minMinutes) return false;
    if (drilldown.maxMinutes !== null && ep.countedMinutes > drilldown.maxMinutes) return false;
    if (drilldown.dayOfWeek !== null || drilldown.hour !== null) {
      const opened = new Date(ep.openedAt);
      const dow = opened.getUTCDay() === 0 ? 7 : opened.getUTCDay();
      const hr = Number(ep.openedAt.slice(11, 13));
      if (drilldown.dayOfWeek !== null && dow !== drilldown.dayOfWeek && all.length > 5) {
        // Keep demo deterministic matches even on narrow dates
        if (Number(ep.id.split("-").at(-1)) % 7 + 1 !== drilldown.dayOfWeek) return false;
      }
      if (drilldown.hour !== null && Math.abs(hr - drilldown.hour) > 2 && hr !== drilldown.hour) return false;
    }
    return true;
  });

  filtered.sort((a, b) => drilldown.sort === "longest"
    ? (b.countedMinutes - a.countedMinutes || a.openedAt.localeCompare(b.openedAt))
    : b.openedAt.localeCompare(a.openedAt));

  const offset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
  const page = filtered.slice(offset, offset + limit);
  const nextCursor = offset + limit < filtered.length ? String(offset + limit) : null;
  return {
    networkId, methodologyVersion: 2,
    range: { from: effectiveFrom, to: effectiveTo, days: serviceDayCount(effectiveFrom, effectiveTo), firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: effectiveTo === availability.today },
    lineId: effectiveLine, stationId: effectiveStation,
    limit, totalCount: filtered.length, sort: drilldown.sort,
    episodes: page, nextCursor,
    message: "Demo episodes. These records are invented.",
  };
}

export function demoCancellations(
  networkId: AnalyticsNetworkId,
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  availability: AnalyticsAvailability,
  granularity: AnalyticsGranularity,
): AnalyticsCancellationsResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const days = serviceDayCount(from, to);
  if (networkId !== "regional") {
    return {
      networkId, methodologyVersion: 2,
      range: { from, to, days, firstAnalyzableDate: null, includesToday: to === availability.today },
      granularity, lineId: query.line, stationId: query.station, trackingStartedAt: null,
      coverage: { observationMinutes: 0, coveragePercentage: 0, confidence: "low", trackedDays: 0, totalDays: days, label: "Not published for TTC" },
      totals: null, buckets: [], message: "Train cancellation tracking applies to GO Transit and UP Express.",
    };
  }
  const byDate = new Map(availability.days.map((day) => [day.date, day]));
  const scopedLines = query.line ? lines.filter((l) => l.id === query.line) : lines.slice(0, 4);
  let totalTrackedDays = 0;
  const corridorTotals = new Map<string, { id: string; number: string | null; label: string; cancellations: number; scheduleMatchedCancellations: number }>();

  const buckets: AnalyticsCancellationBucket[] = buildBuckets(from, to, granularity).map(([bucketFrom, bucketTo], idx) => {
    const dates: string[] = [];
    for (let d = bucketFrom; d <= bucketTo; d = addServiceDays(d, 1)) dates.push(d);
    const trackedDays = dates.filter((d) => byDate.get(d)?.analyzable).length;
    totalTrackedDays += trackedDays;
    const coveragePct = Math.round(trackedDays * 1000 / Math.max(1, dates.length)) / 10;
    const confidence = coveragePct >= 95 ? "high" as const : coveragePct >= 75 ? "medium" as const : "low" as const;
    const includesToday = dates.includes(availability.today);
    if (trackedDays === 0) {
      return {
        from: bucketFrom, to: bucketTo, days: dates.length, trackedDays: 0,
        coveragePercentage: 0, confidence: "low", cancellations: null, scheduleMatchedCancellations: null,
        corridors: [], includesToday,
      };
    }
    const corridors = scopedLines.map((line, lIdx) => {
      const count = ((idx + lIdx * 2) % 3 === 0) ? Math.max(1, Math.round(trackedDays * (0.4 + lIdx * 0.25))) : 0;
      const matched = Math.round(count * 0.8);
      if (count > 0) {
        const prev = corridorTotals.get(line.id) ?? { id: line.id, number: line.number, label: line.name, cancellations: 0, scheduleMatchedCancellations: 0 };
        prev.cancellations += count;
        prev.scheduleMatchedCancellations += matched;
        corridorTotals.set(line.id, prev);
      }
      return { lineId: line.id, number: line.number, label: line.name, cancellations: count, scheduleMatchedCancellations: matched };
    }).filter((c) => c.cancellations > 0);
    const total = corridors.reduce((sum, c) => sum + c.cancellations, 0);
    const matched = corridors.reduce((sum, c) => sum + c.scheduleMatchedCancellations, 0);
    return {
      from: bucketFrom, to: bucketTo, days: dates.length, trackedDays,
      coveragePercentage: coveragePct, confidence, cancellations: total, scheduleMatchedCancellations: matched,
      corridors, includesToday,
    };
  });

  const overallPct = Math.round(totalTrackedDays * 1000 / Math.max(1, days)) / 10;
  const overallConfidence = overallPct >= 95 ? "high" as const : overallPct >= 75 ? "medium" as const : "low" as const;
  const totalCancels = [...corridorTotals.values()].reduce((sum, c) => sum + c.cancellations, 0);
  const totalMatched = [...corridorTotals.values()].reduce((sum, c) => sum + c.scheduleMatchedCancellations, 0);
  return {
    networkId, methodologyVersion: 2,
    range: { from, to, days, firstAnalyzableDate: availability.firstAnalyzableDate, includesToday: to === availability.today },
    granularity, lineId: query.line, stationId: query.station,
    trackingStartedAt: `${availability.firstAnalyzableDate ?? from}T05:00:00Z`,
    coverage: {
      observationMinutes: totalTrackedDays * 1_440,
      coveragePercentage: overallPct,
      confidence: overallConfidence,
      trackedDays: totalTrackedDays,
      totalDays: days,
      label: `${overallPct.toFixed(1)}% tracking coverage · ${totalTrackedDays} of ${days} days tracked`,
    },
    totals: {
      cancellations: totalCancels,
      scheduleMatchedCancellations: totalMatched,
      sourceLabeledCancellations: totalCancels - totalMatched,
      observationMinutes: totalTrackedDays * 1_440,
      coveragePercentage: overallPct,
      confidence: overallConfidence,
      message: "Demo train cancellation trend.",
      corridors: [...corridorTotals.values()].sort((a, b) => b.cancellations - a.cancellations),
    },
    buckets,
    message: "Demo GO Transit and UP Express train cancellations.",
  };
}

export function demoOnTime(
  lines: readonly AnalyticsLineOption[],
  query: AnalyticsQuery,
  range: ResolvedAnalyticsRange,
  granularity: AnalyticsGranularity,
): import("./reliability-analytics.ts").AnalyticsOnTimeResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const scoped = query.line ? lines.filter((l) => l.id === query.line) : lines;
  const bucketBounds = buildBuckets(from, to, granularity);
  const buckets = bucketBounds.map(([bFrom, bTo], idx) => {
    const days = serviceDayCount(bFrom, bTo);
    const scheduledTrips = days * Math.max(1, scoped.length) * 18;
    const observedTrips = Math.round(scheduledTrips * (0.86 - (idx % 3) * 0.04));
    const cancelledTrips = Math.max(0, Math.round(observedTrips * 0.015));
    const terminalObservedTrips = Math.max(0, observedTrips - cancelledTrips);
    const onTimeTrips = Math.round(terminalObservedTrips * (0.93 - (idx % 4) * 0.015));
    const lateTrips = Math.max(0, terminalObservedTrips - onTimeTrips);
    const evaluated = terminalObservedTrips + cancelledTrips;
    return {
      from: bFrom,
      to: bTo,
      scheduledTrips,
      observedTrips,
      terminalObservedTrips,
      onTimeTrips,
      lateTrips,
      cancelledTrips,
      coveragePercentage: Math.round((1000 * observedTrips) / Math.max(1, scheduledTrips)) / 10,
      onTimePercentage: evaluated ? Math.round((1000 * onTimeTrips) / evaluated) / 10 : null,
    };
  });
  const totalScheduled = buckets.reduce((s, b) => s + b.scheduledTrips, 0);
  const totalObserved = buckets.reduce((s, b) => s + b.observedTrips, 0);
  const totalTerminal = buckets.reduce((s, b) => s + b.terminalObservedTrips, 0);
  const totalOnTime = buckets.reduce((s, b) => s + b.onTimeTrips, 0);
  const totalLate = buckets.reduce((s, b) => s + b.lateTrips, 0);
  const totalCancelled = buckets.reduce((s, b) => s + b.cancelledTrips, 0);
  const evalTotal = totalTerminal + totalCancelled;
  return {
    networkId: "regional",
    from,
    to,
    granularity,
    enabled: true,
    onTimeThresholdSeconds: 300,
    definition: "Metrolinx published threshold: rail arrival at the final destination within 5 minutes of schedule, excluding cancellations. Unobserved scheduled trips are unknown, never counted on time.",
    source: "Metrolinx GO & UP GTFS-RT TripUpdates",
    totals: {
      scheduledTrips: totalScheduled,
      observedTrips: totalObserved,
      terminalObservedTrips: totalTerminal,
      onTimeTrips: totalOnTime,
      lateTrips: totalLate,
      cancelledTrips: totalCancelled,
      coveragePercentage: Math.round((1000 * totalObserved) / Math.max(1, totalScheduled)) / 10,
      onTimePercentage: evalTotal ? Math.round((1000 * totalOnTime) / evalTotal) / 10 : null,
    },
    corridors: scoped.map((line, i) => {
      const sched = Math.max(10, Math.round(totalScheduled / Math.max(1, scoped.length)));
      const obs = Math.round(sched * 0.85);
      const cancel = Math.max(0, Math.round(obs * 0.015));
      const term = obs - cancel;
      const ot = Math.round(term * (0.94 - (i % 3) * 0.02));
      return {
        lineId: line.id,
        number: line.number,
        label: line.name,
        scheduledTrips: sched,
        observedTrips: obs,
        terminalObservedTrips: term,
        onTimeTrips: ot,
        lateTrips: term - ot,
        cancelledTrips: cancel,
        coveragePercentage: Math.round((1000 * obs) / sched) / 10,
        onTimePercentage: Math.round((1000 * ot) / Math.max(1, term + cancel)) / 10,
      };
    }),
    buckets,
    message: "Demo GO/UP on-time performance observations.",
  };
}

export function demoTtcDelayLog(
  range: ResolvedAnalyticsRange,
  granularity: AnalyticsGranularity,
): import("./reliability-analytics.ts").AnalyticsTtcDelayLogResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  const bucketBounds = buildBuckets(from, to, granularity);
  const buckets = bucketBounds.map(([bFrom, bTo], idx) => {
    const days = serviceDayCount(bFrom, bTo);
    const incidents = days * (6 + (idx % 4));
    const delayMinutes = incidents * (9 + (idx % 3));
    return { from: bFrom, to: bTo, incidents, delayMinutes };
  });
  const totalIncidents = buckets.reduce((s, b) => s + b.incidents, 0);
  const totalMinutes = buckets.reduce((s, b) => s + b.delayMinutes, 0);
  return {
    networkId: "ttc",
    from,
    to,
    granularity,
    source: "TTC Delay Log · Open Data Toronto",
    licence: "Open Government Licence – Toronto",
    publicationPeriod: { from: "2025-01-01", to, lastModified: `${to}T20:00:00`, rowCount: totalIncidents },
    totals: { incidents: totalIncidents, delayMinutes: totalMinutes, medianDelayMinutes: 8 },
    lines: [
      { lineId: "line-1", label: "Line 1 Yonge-University", incidents: Math.round(totalIncidents * 0.56), delayMinutes: Math.round(totalMinutes * 0.58) },
      { lineId: "line-2", label: "Line 2 Bloor-Danforth", incidents: Math.round(totalIncidents * 0.39), delayMinutes: Math.round(totalMinutes * 0.38) },
      { lineId: "line-4", label: "Line 4 Sheppard", incidents: Math.max(1, Math.round(totalIncidents * 0.05)), delayMinutes: Math.max(5, Math.round(totalMinutes * 0.04)) },
    ],
    topCodes: [
      { code: "SUDP", description: "DISORDERLY PATRON", incidents: Math.round(totalIncidents * 0.2), delayMinutes: Math.round(totalMinutes * 0.22) },
      { code: "MUI", description: "INJURED OR ILL CUSTOMER (ON TRAIN) - TRANSPORTED", incidents: Math.round(totalIncidents * 0.16), delayMinutes: Math.round(totalMinutes * 0.18) },
      { code: "PUTR", description: "TRACK CIRCUIT PROBLEM", incidents: Math.round(totalIncidents * 0.12), delayMinutes: Math.round(totalMinutes * 0.15) },
    ],
    buckets,
    message: "Demo official TTC subway delay log.",
  };
}

export function demoTtcPerformanceHistory(
  range: ResolvedAnalyticsRange,
): import("./reliability-analytics.ts").AnalyticsTtcPerformanceHistoryResponse {
  const from = range.from ?? range.requestedFrom;
  const to = range.to ?? range.requestedTo;
  return {
    networkId: "ttc",
    from,
    to,
    source: "TTC.ca",
    metrics: [
      {
        metricKey: "subway-line-1",
        label: "Line 1 Yonge-University",
        category: "Subway",
        target: 95,
        points: [
          { readingDate: from, percentage: 94, valueLabel: "94%", updatedLabel: from },
          { readingDate: to, percentage: 96, valueLabel: "96%", updatedLabel: to },
        ],
      },
      {
        metricKey: "subway-line-2",
        label: "Line 2 Bloor-Danforth",
        category: "Subway",
        target: 95,
        points: [
          { readingDate: from, percentage: 93, valueLabel: "93%", updatedLabel: from },
          { readingDate: to, percentage: 95, valueLabel: "95%", updatedLabel: to },
        ],
      },
    ],
    message: "Demo stored TTC.ca performance readings.",
  };
}
