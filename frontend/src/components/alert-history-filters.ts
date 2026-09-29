import type {
  AlertHistoryEvent,
  AlertHistoryIncident,
} from "../app/alert-history-data";

export type AlertHistoryStatusFilter = "all" | "active" | "cleared";

export type AlertHistoryLineOption = {
  value: string;
  label: string;
  sortKey: number;
  lineId?: string | null;
  lineNumber?: string | null;
  lineName?: string | null;
};

export type AlertHistorySortGroup = {
  id: string;
  label: string;
  options: AlertHistorySortOption[];
};

export type AlertHistorySortOption = {
  value: string;
  label: string;
  group?: "timing" | "duration" | "status" | "attributes" | "types";
  eventType: string | null;
  iconType?: string;
};

export type AlertHistoryTypeOption = {
  value: string;
  label: string;
  eventType: string | null;
};

export type AlertHistoryViewItem = {
  incident: AlertHistoryIncident;
  latestEvent: AlertHistoryEvent;
  cleared: boolean;
};

export type AlertHistorySearchIndex = ReadonlyMap<AlertHistoryIncident, string>;

export type AlertHistoryFilterControls = {
  statusFilter: AlertHistoryStatusFilter;
  lineId: string;
  typeId?: string;
  searchQuery: string;
  sortBy?: string;
  since?: string;
  until?: string;
};

export const ALL_LINES_VALUE = "all";
export const ALL_TYPES_VALUE = "all";
export const UNKNOWN_LINE_VALUE = "__unknown";
export const MOST_RECENT_SORT_VALUE = "most-recent";

export const SORT_MOST_RECENT = "most-recent";
export const SORT_OLDEST = "oldest";
export const SORT_LONGEST_DURATION = "longest-duration";
export const SORT_SHORTEST_DURATION = "shortest-duration";
export const SORT_ALERT_TYPE = "alert-type";
export const SORT_LINE = "line";
export const SORT_LOCATION_AZ = "location-az";
export const SORT_LOCATION_ZA = "location-za";
export const SORT_CAUSE_AZ = "cause-az";
export const SORT_MOST_UPDATES = "most-updates";
export const SORT_LEAST_UPDATES = "least-updates";
export const SORT_ACTIVE_FIRST = "active-first";
export const SORT_CLEARED_FIRST = "cleared-first";

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

const EVENT_TYPE_RANKS: Record<string, number> = {
  "suspension": 1,
  "delay": 2,
  "reduced-speed-zone": 3,
  "planned-closure": 4,
};

export function filterAndSortAlertHistory(
  incidents: AlertHistoryIncident[],
  controls: AlertHistoryFilterControls,
  searchIndex?: AlertHistorySearchIndex,
): AlertHistoryViewItem[] {
  const query = normalizeSearchText(controls.searchQuery);
  const sortBy = controls.sortBy ?? MOST_RECENT_SORT_VALUE;
  const typeFilter = controls.typeId ?? ALL_TYPES_VALUE;

  const filtered = incidents.flatMap((incident) => {
    const latestEvent = selectLatestEvent(incident);
    if (!latestEvent || !incidentFallsWithinWindow(incident, controls.since, controls.until)) {
      return [];
    }
    const cleared = latestIncidentState(incident, latestEvent) === "cleared";

    if (controls.statusFilter === "active" && cleared) {
      return [];
    }

    if (controls.statusFilter === "cleared" && !cleared) {
      return [];
    }

    if (
      controls.lineId !== ALL_LINES_VALUE &&
      lineValue(incident) !== controls.lineId
    ) {
      return [];
    }

    if (
      typeFilter !== ALL_TYPES_VALUE &&
      !isSameEventType(incident.eventType || "", typeFilter)
    ) {
      return [];
    }

    if (query && !incidentMatchesSearch(incident, query, searchIndex)) {
      return [];
    }

    return [{
      incident,
      latestEvent,
      cleared,
    }];
  });

  return filtered.sort((a, b) => {
    const timeA = getEventTimestamp(a);
    const timeB = getEventTimestamp(b);

    switch (sortBy) {
      case SORT_OLDEST:
        return timeA - timeB;

      case SORT_LONGEST_DURATION: {
        const durA = getIncidentDuration(a.incident);
        const durB = getIncidentDuration(b.incident);
        if (durA !== durB) {
          return durB - durA;
        }
        return timeB - timeA;
      }

      case SORT_SHORTEST_DURATION: {
        const durA = a.incident.durationMinutes != null && a.incident.durationMinutes >= 0
          ? a.incident.durationMinutes
          : Number.POSITIVE_INFINITY;
        const durB = b.incident.durationMinutes != null && b.incident.durationMinutes >= 0
          ? b.incident.durationMinutes
          : Number.POSITIVE_INFINITY;
        if (durA !== durB) {
          return durA - durB;
        }
        return timeB - timeA;
      }

      case SORT_ALERT_TYPE: {
        const typeOrderA = getEventTypeSortRank(a.incident.eventType);
        const typeOrderB = getEventTypeSortRank(b.incident.eventType);
        if (typeOrderA !== typeOrderB) {
          return typeOrderA - typeOrderB;
        }
        return timeB - timeA;
      }

      case SORT_LINE: {
        const rankA = lineSortKey(a.incident);
        const rankB = lineSortKey(b.incident);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        const nameA = a.incident.lineName ?? a.incident.lineNumber ?? "";
        const nameB = b.incident.lineName ?? b.incident.lineNumber ?? "";
        const nameComp = nameA.localeCompare(nameB);
        if (nameComp !== 0) return nameComp;
        return timeB - timeA;
      }

      case SORT_LOCATION_AZ: {
        const locA = (a.incident.location || "").trim();
        const locB = (b.incident.location || "").trim();
        if (locA && !locB) return -1;
        if (!locA && locB) return 1;
        if (locA && locB) {
          const comp = locA.localeCompare(locB);
          if (comp !== 0) return comp;
        }
        return timeB - timeA;
      }

      case SORT_LOCATION_ZA: {
        const locA = (a.incident.location || "").trim();
        const locB = (b.incident.location || "").trim();
        if (locA && !locB) return -1;
        if (!locA && locB) return 1;
        if (locA && locB) {
          const comp = locB.localeCompare(locA);
          if (comp !== 0) return comp;
        }
        return timeB - timeA;
      }

      case SORT_CAUSE_AZ: {
        const causeA = (a.incident.cause || "").trim();
        const causeB = (b.incident.cause || "").trim();
        if (causeA && !causeB) return -1;
        if (!causeA && causeB) return 1;
        if (causeA && causeB) {
          const comp = causeA.localeCompare(causeB);
          if (comp !== 0) return comp;
        }
        return timeB - timeA;
      }

      case SORT_MOST_UPDATES: {
        const countA = getIncidentUpdateCount(a.incident);
        const countB = getIncidentUpdateCount(b.incident);
        if (countA !== countB) {
          return countB - countA;
        }
        return timeB - timeA;
      }

      case SORT_LEAST_UPDATES: {
        const countA = getIncidentUpdateCount(a.incident);
        const countB = getIncidentUpdateCount(b.incident);
        if (countA !== countB) {
          return countA - countB;
        }
        return timeB - timeA;
      }

      case SORT_ACTIVE_FIRST: {
        if (a.cleared !== b.cleared) {
          return a.cleared ? 1 : -1;
        }
        return timeB - timeA;
      }

      case SORT_CLEARED_FIRST: {
        if (a.cleared !== b.cleared) {
          return a.cleared ? -1 : 1;
        }
        return timeB - timeA;
      }

      case SORT_MOST_RECENT:
      default: {
        if (sortBy !== MOST_RECENT_SORT_VALUE) {
          const aType = a.incident.eventType || "";
          const bType = b.incident.eventType || "";
          const aMatches = isSameEventType(aType, sortBy);
          const bMatches = isSameEventType(bType, sortBy);
          if (aMatches && !bMatches) return -1;
          if (!aMatches && bMatches) return 1;
        }
        return timeB - timeA;
      }
    }
  });
}

export function buildAlertHistorySearchIndex(
  incidents: AlertHistoryIncident[],
): AlertHistorySearchIndex {
  return new Map(incidents.map((incident) => [incident, buildIncidentSearchText(incident)]));
}

function getIncidentDuration(incident: AlertHistoryIncident): number {
  if (incident.durationMinutes != null && incident.durationMinutes >= 0) {
    return incident.durationMinutes;
  }
  if (incident.status === "active" && incident.firstSeenAt) {
    const start = new Date(incident.firstSeenAt).getTime();
    if (!Number.isNaN(start)) {
      return Math.max(0, Math.round((Date.now() - start) / 60000));
    }
  }
  return -1;
}

function getEventTypeSortRank(eventType: string | null | undefined): number {
  if (!eventType) return 99;
  const key = normalizeEventTypeKey(eventType);
  return EVENT_TYPE_RANKS[key] ?? 50;
}

function getEventTimestamp(item: AlertHistoryViewItem): number {
  const isoString =
    item.latestEvent.happenedAt ??
    item.incident.latestEventAt ??
    item.incident.clearedAt ??
    item.incident.firstSeenAt ??
    "";
  const time = new Date(isoString).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function selectLatestEvent(
  incident: AlertHistoryIncident,
): AlertHistoryEvent | null {
  return incident.events.reduce<AlertHistoryEvent | null>((latest, event) => {
    if (!latest) return event;
    const eventTime = eventTimestamp(event);
    const latestTime = eventTimestamp(latest);
    if (eventTime !== latestTime) {
      return eventTime > latestTime ? event : latest;
    }
    return event.id > latest.id ? event : latest;
  }, null);
}

function latestIncidentState(
  incident: AlertHistoryIncident,
  latestEvent: AlertHistoryEvent,
) {
  return (incident.latestState || latestEvent.state).trim().toLowerCase();
}

function incidentFallsWithinWindow(
  incident: AlertHistoryIncident,
  since?: string,
  until?: string,
) {
  return incident.events.some((event) => eventFallsWithinWindow(event, since, until));
}

function eventTimestamp(event: AlertHistoryEvent) {
  const timestamp = new Date(event.happenedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getIncidentUpdateCount(incident: AlertHistoryIncident) {
  return incident.events.filter((event) => event.state === "updated").length;
}

function eventFallsWithinWindow(event: AlertHistoryEvent, since?: string, until?: string) {
  if (!since || !until) return true;
  const happenedAt = new Date(event.happenedAt).getTime();
  const windowStart = new Date(since).getTime();
  const windowEnd = new Date(until).getTime();
  if ([happenedAt, windowStart, windowEnd].some(Number.isNaN)) return true;
  return happenedAt >= windowStart && happenedAt < windowEnd;
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

export function buildAlertHistoryTypeOptions(
  incidents: AlertHistoryIncident[],
): AlertHistoryTypeOption[] {
  const options: AlertHistoryTypeOption[] = [
    { value: ALL_TYPES_VALUE, label: "All Types", eventType: null },
  ];

  const seen = new Set<string>();

  for (const type of STANDARD_ALERT_TYPES) {
    const key = normalizeEventTypeKey(type);
    if (!seen.has(key)) {
      seen.add(key);
      options.push({
        value: key,
        label: formatAlertTypeName(type),
        eventType: type,
      });
    }
  }

  for (const incident of incidents) {
    if (incident.eventType) {
      const key = normalizeEventTypeKey(incident.eventType);
      if (!seen.has(key)) {
        seen.add(key);
        options.push({
          value: key,
          label: formatAlertTypeName(incident.eventType),
          eventType: incident.eventType,
        });
      }
    }
  }

  return options;
}

export function buildAlertHistorySortGroups(): AlertHistorySortGroup[] {
  return [
    {
      id: "timing",
      label: "Timing",
      options: [
        { value: SORT_MOST_RECENT, label: "Most Recent", group: "timing", eventType: null, iconType: "clock" },
        { value: SORT_OLDEST, label: "Oldest", group: "timing", eventType: null, iconType: "history" },
      ],
    },
    {
      id: "duration",
      label: "Duration",
      options: [
        { value: SORT_LONGEST_DURATION, label: "Longest Duration", group: "duration", eventType: null, iconType: "duration-desc" },
        { value: SORT_SHORTEST_DURATION, label: "Shortest Duration", group: "duration", eventType: null, iconType: "duration-asc" },
      ],
    },
    {
      id: "status",
      label: "Status & Updates",
      options: [
        { value: SORT_ACTIVE_FIRST, label: "Active First", group: "status", eventType: null, iconType: "active" },
        { value: SORT_CLEARED_FIRST, label: "Cleared First", group: "status", eventType: null, iconType: "cleared" },
        { value: SORT_MOST_UPDATES, label: "Most Updates", group: "status", eventType: null, iconType: "most-updates" },
        { value: SORT_LEAST_UPDATES, label: "Least Updates", group: "status", eventType: null, iconType: "least-updates" },
      ],
    },
    {
      id: "attributes",
      label: "Line & Location",
      options: [
        { value: SORT_ALERT_TYPE, label: "Alert Type", group: "attributes", eventType: null, iconType: "alert-type" },
        { value: SORT_LINE, label: "Transit Line", group: "attributes", eventType: null, iconType: "line" },
        { value: SORT_LOCATION_AZ, label: "Location (A → Z)", group: "attributes", eventType: null, iconType: "location" },
        { value: SORT_LOCATION_ZA, label: "Location (Z → A)", group: "attributes", eventType: null, iconType: "location" },
        { value: SORT_CAUSE_AZ, label: "Cause (A → Z)", group: "attributes", eventType: null, iconType: "cause" },
      ],
    },
  ];
}

export function buildAlertHistorySortOptions(
  incidents?: AlertHistoryIncident[],
): AlertHistorySortOption[] {
  const groups = buildAlertHistorySortGroups();
  const options = groups.flatMap((g) => g.options);

  const seenValues = new Set<string>(options.map((o) => o.value));

  for (const type of STANDARD_ALERT_TYPES) {
    const key = normalizeEventTypeKey(type);
    if (!seenValues.has(key)) {
      seenValues.add(key);
      options.push({
        value: key,
        label: formatAlertTypeName(type),
        group: "types",
        eventType: type,
      });
    }
  }

  if (incidents) {
    for (const incident of incidents) {
      if (incident.eventType) {
        const key = normalizeEventTypeKey(incident.eventType);
        if (!seenValues.has(key)) {
          seenValues.add(key);
          options.push({
            value: key,
            label: formatAlertTypeName(incident.eventType),
            group: "types",
            eventType: incident.eventType,
          });
        }
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
  if (normalized === "limited-service") return "delay";
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
    return "Suspension";
  }
  if (normalized === "limited-service") return "Limited service";
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
    return "Planned Advisory";
  }
  return eventType
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function incidentMatchesSearch(
  incident: AlertHistoryIncident,
  normalizedQuery: string,
  searchIndex?: AlertHistorySearchIndex,
): boolean {
  const searchable = searchIndex?.get(incident) ?? buildIncidentSearchText(incident);

  return normalizedQuery
    .split(" ")
    .every((token) => searchable.includes(token));
}

function buildIncidentSearchText(incident: AlertHistoryIncident): string {
  const eventTypeLabel = formatAlertTypeName(incident.eventType ?? "");
  return normalizeSearchText([
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
