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

export type AlertHistorySortOption = {
  value: string;
  label: string;
  eventType: string | null;
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
  sortBy?: string;
};

export const ALL_LINES_VALUE = "all";
export const UNKNOWN_LINE_VALUE = "__unknown";
export const MOST_RECENT_SORT_VALUE = "most-recent";

const TTC_LINE_ORDER = new Map<string, number>([
  ["line-1", 1],
  ["line-2", 2],
  ["line-4", 4],
  ["line-5", 5],
  ["line-6", 6],
]);

const STANDARD_ALERT_TYPES = [
  "suspension",
  "delay",
  "reduced-speed-zone",
  "planned-closure",
];

export function filterAndSortAlertHistory(
  incidents: AlertHistoryIncident[],
  controls: AlertHistoryFilterControls,
): AlertHistoryViewItem[] {
  const query = normalizeSearchText(controls.searchQuery);
  const sortBy = controls.sortBy ?? MOST_RECENT_SORT_VALUE;

  const filtered = incidents.flatMap((incident) => {
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

  return filtered.sort((a, b) => {
    if (sortBy !== MOST_RECENT_SORT_VALUE) {
      const aType = a.incident.eventType || "";
      const bType = b.incident.eventType || "";
      const aMatches = isSameEventType(aType, sortBy);
      const bMatches = isSameEventType(bType, sortBy);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
    }
    const timeA = getEventTimestamp(a);
    const timeB = getEventTimestamp(b);
    return timeB - timeA;
  });
}

function getEventTimestamp(item: AlertHistoryViewItem): number {
  const isoString =
    item.displayEvent?.happenedAt ??
    item.incident.clearedAt ??
    item.incident.firstSeenAt ??
    "";
  const time = new Date(isoString).getTime();
  return Number.isNaN(time) ? 0 : time;
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

  byValue.set(ALL_LINES_VALUE, {
    value: ALL_LINES_VALUE,
    label: "All Lines",
    sortKey: 0,
  });

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

  return Array.from(byValue.values()).sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    return a.label.localeCompare(b.label);
  });
}

export function buildAlertHistorySortOptions(
  incidents: AlertHistoryIncident[],
): AlertHistorySortOption[] {
  const options: AlertHistorySortOption[] = [
    { value: MOST_RECENT_SORT_VALUE, label: "Most Recent", eventType: null },
  ];

  const seenLabels = new Set<string>();

  for (const type of STANDARD_ALERT_TYPES) {
    const label = formatAlertTypeName(type);
    seenLabels.add(label.toLowerCase());
    options.push({
      value: type,
      label,
      eventType: type,
    });
  }

  for (const incident of incidents) {
    if (incident.eventType) {
      const label = formatAlertTypeName(incident.eventType);
      const normalizedLabel = label.toLowerCase();
      if (!seenLabels.has(normalizedLabel)) {
        seenLabels.add(normalizedLabel);
        const normalizedValue = incident.eventType.toLowerCase();
        options.push({
          value: normalizedValue,
          label,
          eventType: normalizedValue,
        });
      }
    }
  }

  return options;
}

export function normalizeEventTypeKey(eventType: string): string {
  const normalized = (eventType || "").trim().toLowerCase();
  if (
    normalized === "suspension" ||
    normalized === "active-alert" ||
    normalized === "active_alert"
  ) {
    return "suspension";
  }
  if (
    normalized === "reduced-speed-zone" ||
    normalized === "reduced_speed_zone"
  ) {
    return "reduced-speed-zone";
  }
  if (
    normalized === "planned-closure" ||
    normalized === "planned_closure" ||
    normalized === "closure"
  ) {
    return "planned-closure";
  }
  return normalized;
}

export function isSameEventType(typeA: string, typeB: string): boolean {
  return normalizeEventTypeKey(typeA) === normalizeEventTypeKey(typeB);
}

export function formatAlertTypeName(eventType: string): string {
  if (!eventType) return "Alert";
  const normalized = eventType.trim().toLowerCase();
  if (
    normalized === "suspension" ||
    normalized === "active-alert" ||
    normalized === "active_alert"
  ) {
    return "Active Alert";
  }
  if (normalized === "delay") {
    return "Delay";
  }
  if (
    normalized === "reduced-speed-zone" ||
    normalized === "reduced_speed_zone"
  ) {
    return "Reduced Speed Zone";
  }
  if (
    normalized === "planned-closure" ||
    normalized === "planned_closure" ||
    normalized === "closure"
  ) {
    return "Planned Closure";
  }
  return eventType
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function incidentMatchesSearch(
  incident: AlertHistoryIncident,
  normalizedQuery: string,
): boolean {
  const eventTypeLabel = formatAlertTypeName(incident.eventType ?? "");
  const searchable = normalizeSearchText([
    incident.alertId,
    incident.sourceId,
    incident.lineId,
    incident.lineNumber,
    incident.lineName,
    incident.eventType,
    eventTypeLabel,
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
    return "Line Unavailable";
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
