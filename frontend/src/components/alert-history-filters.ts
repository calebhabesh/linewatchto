import type {
  AlertHistoryEvent,
  AlertHistoryIncident,
} from "../app/alert-history-data";

export type AlertHistoryLifecycleFilter = "all" | "alerts" | "clearances";

export type AlertHistoryLineOption = {
  value: string;
  label: string;
  sortKey: number;
  lineId?: string | null;
  lineNumber?: string | null;
  lineName?: string | null;
};

export type AlertHistoryViewItem = {
  incident: AlertHistoryIncident;
  displayEvent: AlertHistoryEvent | null;
  cleared: boolean;
};

export type AlertHistoryFilterControls = {
  lifecycleFilter: AlertHistoryLifecycleFilter;
  lineId: string;
  searchQuery: string;
};

export const ALL_LINES_VALUE = "all";
export const UNKNOWN_LINE_VALUE = "__unknown";

const TTC_LINE_ORDER = new Map<string, number>([
  ["line-1", 1],
  ["line-2", 2],
  ["line-4", 4],
  ["line-5", 5],
  ["line-6", 6],
]);

export function filterAndSortAlertHistory(
  incidents: AlertHistoryIncident[],
  controls: AlertHistoryFilterControls,
): AlertHistoryViewItem[] {
  const query = normalizeSearchText(controls.searchQuery);

  return incidents.flatMap((incident) => {
    const displayEvent = selectDisplayEvent(incident, controls.lifecycleFilter);
    if (!displayEvent) {
      return [];
    }

    if (
      controls.lineId !== ALL_LINES_VALUE &&
      lineValue(incident) !== controls.lineId
    ) {
      return [];
    }

    if (query && !incidentMatchesSearch(incident, query)) {
      return [];
    }

    return [{
      incident,
      displayEvent,
      cleared: displayEvent.state === "cleared",
    }];
  });
}

export function selectDisplayEvent(
  incident: AlertHistoryIncident,
  filter: AlertHistoryLifecycleFilter,
): AlertHistoryEvent | null {
  if (filter === "clearances") {
    return incident.events.find((event) => event.state === "cleared") ?? null;
  }

  if (filter === "alerts") {
    return incident.events.find((event) => event.state !== "cleared") ?? null;
  }

  return incident.events[0] ?? null;
}

export function buildAlertHistoryLineOptions(
  incidents: AlertHistoryIncident[],
): AlertHistoryLineOption[] {
  const byValue = new Map<string, AlertHistoryLineOption>();

  for (const incident of incidents) {
    const value = lineValue(incident);
    if (byValue.has(value)) {
      continue;
    }
    byValue.set(value, {
      value,
      label: lineOptionLabel(incident),
      sortKey: lineSortKey(incident),
      lineId: incident.lineId,
      lineNumber: incident.lineNumber,
      lineName: incident.lineName,
    });
  }

  return [
    { value: ALL_LINES_VALUE, label: "All lines", sortKey: -1 },
    ...Array.from(byValue.values()).sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.label.localeCompare(b.label);
    }),
  ];
}

function incidentMatchesSearch(
  incident: AlertHistoryIncident,
  normalizedQuery: string,
): boolean {
  const searchable = normalizeSearchText([
    incident.alertId,
    incident.sourceId,
    incident.lineId,
    incident.lineNumber,
    incident.lineName,
    incident.eventType,
    incident.title,
    incident.location,
    incident.displayDirection,
    incident.source,
    incident.cause,
    incident.status,
    ...incident.events.flatMap((event) => [
      event.state,
      event.label,
      event.title,
      event.description,
      event.location,
      event.displayDirection,
      event.cause,
      event.source,
    ]),
  ].filter(Boolean).join(" "));

  return normalizedQuery
    .split(" ")
    .every((token) => searchable.includes(token));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lineValue(incident: AlertHistoryIncident): string {
  return incident.lineId || UNKNOWN_LINE_VALUE;
}

function lineOptionLabel(incident: AlertHistoryIncident): string {
  if (!incident.lineNumber) {
    return "Line unavailable";
  }
  return incident.lineName
    ? `Line ${incident.lineNumber} ${incident.lineName}`
    : `Line ${incident.lineNumber}`;
}

function lineSortKey(incident: AlertHistoryIncident): number {
  if (incident.lineId) {
    const knownOrder = TTC_LINE_ORDER.get(incident.lineId);
    if (knownOrder !== undefined) {
      return knownOrder;
    }
  }

  const parsedLineNumber = Number.parseInt(incident.lineNumber ?? "", 10);
  if (Number.isFinite(parsedLineNumber)) {
    return parsedLineNumber;
  }

  return 999;
}
