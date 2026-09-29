import {
  apiUrl,
  accountJsonRequest,
  accountEmptyRequest,
  accountRequestError,
  readJson,
  type AdapterOptions,
} from "./account-transport.ts";
import type { NetworkId } from "./regional-data.ts";

export type AccountCommutePath = {
  status: "available" | "unavailable";
  stationIds: string[];
  segmentIds: string[];
  segmentHops: AccountCommutePathSegmentHop[];
  lineIds: string[];
  transferStationIds: string[];
  estimatedTravelSeconds: number;
  weightSource: "gtfs-scheduled-median" | "mixed-scheduled-fallback" | "seeded-fallback" | "topology-fallback" | "regional-topology-estimate" | "unavailable";
  summary: string;
};

export type AccountCommutePathSegmentHop = {
  segmentId: string;
  lineId: string;
  fromStationId: string;
  toStationId: string;
  travelDirection: "forward" | "reverse" | "bidirectional";
};

export type AccountMatchedImpact = {
  serviceEffect?: string | null;
  relatedPlannedClosureId?: string | null;
  id: string;
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  status: "current" | "planned";
  severity: "minor" | "major" | "suspended" | "planned";
  title: string;
  lineId: string | null;
  lineNumber: string | null;
  location: string | null;
  displayDirection: string | null;
  description?: string | null;
  source: string;
  matchedSegmentIds: string[];
  matchedStationIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  window?: string | null;
  timingStatus?: "active-now" | "upcoming" | "unknown" | null;
  eventStartAt?: string | null;
  ignoredByRule?: boolean;
};

export type AccountCommuteTravelTimeEstimate = {
  status: "standard" | "estimated" | "unreliable" | "unavailable";
  baselineSeconds: number;
  estimatedLowSeconds: number | null;
  estimatedHighSeconds: number | null;
  extraLowSeconds: number | null;
  extraHighSeconds: number | null;
  confidence: "high" | "medium" | "low" | "none" | string;
  summary: string;
};

export type AccountCommuteImpact = {
  status: "clear" | "affected" | "planned" | "unavailable";
  severity: "clear" | "minor" | "major" | "suspended" | "planned" | "unavailable";
  statusLabel: string;
  detail: string;
  matchedImpacts: AccountMatchedImpact[];
  travelTimeEstimate?: AccountCommuteTravelTimeEstimate | null;
};

export type AccountCommuteLegId = "outbound" | "return";

export type AccountCommuteLeg = {
  id: AccountCommuteLegId;
  routeLabel: string;
  fromStationId: string;
  fromStationName: string;
  toStationId: string;
  toStationName: string;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
};

export type AccountSavedCommuteNotificationEventTypes = {
  suspensions: boolean;
  delays: boolean;
  tripCancellations: boolean;
  reducedSpeedZones: boolean;
  plannedClosures: boolean;
  serviceRestored: boolean;
};

export type AccountSavedCommuteNotificationSchedule = {
  dayMask: number;
  startMinute: number | null;
  endMinute: number | null;
};

export type AccountSavedCommuteNotificationRule = {
  enabled: boolean;
  dayMask: number;
  startMinute: number | null;
  endMinute: number | null;
  outboundEnabled: boolean;
  returnEnabled: boolean;
  eventTypes: AccountSavedCommuteNotificationEventTypes;
  outboundSchedule: AccountSavedCommuteNotificationSchedule;
  returnSchedule: AccountSavedCommuteNotificationSchedule;
};

export const defaultSavedCommuteNotificationRule: AccountSavedCommuteNotificationRule = {
  enabled: true,
  dayMask: 62,
  startMinute: 390,
  endMinute: 570,
  outboundEnabled: true,
  returnEnabled: true,
  eventTypes: {
    suspensions: true,
    delays: true,
    tripCancellations: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: true,
  },
  outboundSchedule: {
    dayMask: 62,
    startMinute: 390,
    endMinute: 570,
  },
  returnSchedule: {
    dayMask: 62,
    startMinute: 900,
    endMinute: 1140,
  },
};

export type AccountSavedCommute = {
  id: string;
  label: string;
  networkId: NetworkId;
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  routeLabel: string;
  watchReturnTrip: boolean;
  outboundLeg: AccountCommuteLeg;
  returnLeg: AccountCommuteLeg | null;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
  notificationRule: AccountSavedCommuteNotificationRule;
  createdAt: string;
  updatedAt: string;
};

export type AccountCommutePathPreview = {
  id: string;
  commuteId: string;
  legId: AccountCommuteLegId;
  label: string;
  routeLabel: string;
  stationIds: string[];
  segmentIds: string[];
};

export function commuteLegsForCommute(commute: AccountSavedCommute): AccountCommuteLeg[] {
  const outbound = commute.outboundLeg ?? {
    id: "outbound" as const,
    routeLabel: commute.routeLabel,
    fromStationId: commute.originStationId,
    fromStationName: commute.originStationName,
    toStationId: commute.destinationStationId,
    toStationName: commute.destinationStationName,
    path: commute.path,
    impact: commute.impact,
  };
  return commute.watchReturnTrip && commute.returnLeg ? [outbound, commute.returnLeg] : [outbound];
}

export type SavedCommuteSort = "impact" | "recent" | "oldest" | "name";

function commuteSeverityPriority(severity: AccountCommuteImpact["severity"]) {
  switch (severity) {
    case "suspended":
      return 5;
    case "major":
      return 4;
    case "minor":
      return 3;
    case "planned":
      return 2;
    case "unavailable":
      return 1;
    case "clear":
    default:
      return 0;
  }
}

function commuteImpactSortKey(commute: AccountSavedCommute) {
  const legs = commuteLegsForCommute(commute);
  return {
    severity: Math.max(...legs.map((leg) => commuteSeverityPriority(leg.impact.severity)), 0),
    currentImpacts: legs
      .flatMap((leg) => leg.impact.matchedImpacts)
      .filter((impact) => impact.status === "current" && !impact.ignoredByRule).length,
  };
}

function savedCommuteTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Returns a copy so changing the display order never changes the account-owned route order.
 * The default puts the routes needing the most attention first, then newest routes for ties.
 */
export function sortSavedCommutes(commutes: AccountSavedCommute[], sort: SavedCommuteSort = "impact") {
  return [...commutes].sort((a, b) => {
    if (sort === "name") {
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        || savedCommuteTime(b.createdAt) - savedCommuteTime(a.createdAt);
    }

    if (sort === "recent") {
      return savedCommuteTime(b.createdAt) - savedCommuteTime(a.createdAt)
        || a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    }

    if (sort === "oldest") {
      return savedCommuteTime(a.createdAt) - savedCommuteTime(b.createdAt)
        || a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    }

    const aImpact = commuteImpactSortKey(a);
    const bImpact = commuteImpactSortKey(b);
    return bImpact.severity - aImpact.severity
      || bImpact.currentImpacts - aImpact.currentImpacts
      || savedCommuteTime(b.createdAt) - savedCommuteTime(a.createdAt)
      || a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export type SavedCommuteStatusSummary = {
  clear: number;
  affectedNow: number;
};

export function summarizeSavedCommuteStatuses(commutes: AccountSavedCommute[]): SavedCommuteStatusSummary {
  return commutes.reduce<SavedCommuteStatusSummary>((summary, commute) => {
    const legs = commuteLegsForCommute(commute);
    if (legs.some((leg) => leg.impact.status === "affected" || leg.impact.matchedImpacts.some((impact) => impact.status === "current" && !impact.ignoredByRule))) {
      summary.affectedNow++;
      return summary;
    }
    if (legs.length > 0 && legs.every((leg) => leg.impact.status === "clear")) {
      summary.clear++;
    }
    return summary;
  }, { clear: 0, affectedNow: 0 });
}

export function commuteLegForCommute(commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound"): AccountCommuteLeg {
  return commuteLegsForCommute(commute).find((leg) => leg.id === legId) ?? commuteLegsForCommute(commute)[0];
}

export function commutePathPreviewFromCommute(commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound"): AccountCommutePathPreview | null {
  const leg = commuteLegForCommute(commute, legId);
  if (leg.path.status !== "available" || leg.path.segmentIds.length === 0) {
    return null;
  }

  return {
    id: `${commute.id}-${leg.id}`,
    commuteId: commute.id,
    legId: leg.id,
    label: commute.label,
    routeLabel: leg.routeLabel,
    stationIds: leg.path.stationIds,
    segmentIds: leg.path.segmentIds,
  };
}

export type AccountSavedCommuteResult = {
  source: "backend" | "unavailable";
  commutes: AccountSavedCommute[];
  message?: string;
};

export type CreateSavedCommuteInput = {
  label: string;
  networkId?: NetworkId;
  originStationId: string;
  destinationStationId: string;
  watchReturnTrip?: boolean;
  notificationRule?: AccountSavedCommuteNotificationRule;
};

export type UpdateSavedCommuteInput = {
  label: string;
  originStationId: string;
  destinationStationId: string;
  watchReturnTrip: boolean;
};

export function normalizeSavedCommuteNotificationRule(
  rule?: Partial<AccountSavedCommuteNotificationRule> | null
): AccountSavedCommuteNotificationRule {
  const legacySchedule: AccountSavedCommuteNotificationSchedule = rule ? {
    dayMask: typeof rule.dayMask === "number" ? rule.dayMask : 127,
    startMinute: typeof rule.startMinute === "number" ? rule.startMinute : null,
    endMinute: typeof rule.endMinute === "number" ? rule.endMinute : null,
  } : defaultSavedCommuteNotificationRule.outboundSchedule;
  const normalizeSchedule = (
    schedule: AccountSavedCommuteNotificationSchedule | undefined,
    fallback: AccountSavedCommuteNotificationSchedule,
  ): AccountSavedCommuteNotificationSchedule => schedule ? ({
    dayMask: typeof schedule.dayMask === "number" ? schedule.dayMask : fallback.dayMask,
    startMinute: typeof schedule.startMinute === "number" ? schedule.startMinute : null,
    endMinute: typeof schedule.endMinute === "number" ? schedule.endMinute : null,
  }) : ({ ...fallback });
  const outboundSchedule = normalizeSchedule(rule?.outboundSchedule, legacySchedule);
  const returnSchedule = normalizeSchedule(
    rule?.returnSchedule,
    rule ? legacySchedule : defaultSavedCommuteNotificationRule.returnSchedule,
  );
  return {
    ...defaultSavedCommuteNotificationRule,
    ...rule,
    // The legacy fields mirror outbound so an older backend/client remains safe during rollout.
    dayMask: outboundSchedule.dayMask,
    startMinute: outboundSchedule.startMinute,
    endMinute: outboundSchedule.endMinute,
    eventTypes: {
      ...defaultSavedCommuteNotificationRule.eventTypes,
      ...(rule?.eventTypes ?? {}),
    },
    outboundSchedule,
    returnSchedule,
  };
}

export function normalizeSavedCommute(commute: AccountSavedCommute): AccountSavedCommute {
  return {
    ...commute,
    networkId: commute.networkId ?? "ttc",
    notificationRule: normalizeSavedCommuteNotificationRule(commute.notificationRule),
  };
}

export async function getSavedCommutes(options: AdapterOptions = {}): Promise<AccountSavedCommuteResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/commutes", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await accountRequestError(response, "My Commutes request failed");
    }
    const body = await readJson<{ commutes: AccountSavedCommute[] }>(response);
    return { source: "backend", commutes: body.commutes.map(normalizeSavedCommute) };
  } catch {
    return {
      source: "unavailable",
      commutes: [],
      message: "My Commutes is unavailable.",
    };
  }
}

export async function createSavedCommute(input: CreateSavedCommuteInput, options: AdapterOptions = {}) {
  const data = await accountJsonRequest<AccountSavedCommute>(
    "/api/account/commutes",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
  return normalizeSavedCommute(data);
}

export async function updateSavedCommuteNotificationRule(
  id: string,
  notificationRule: AccountSavedCommuteNotificationRule,
  options: AdapterOptions = {},
) {
  const data = await accountJsonRequest<AccountSavedCommute>(
    `/api/account/commutes/${encodeURIComponent(id)}/notification-rule`,
    { method: "PATCH", body: JSON.stringify(notificationRule) },
    options,
  );
  return normalizeSavedCommute(data);
}

export async function updateSavedCommute(
  id: string,
  input: UpdateSavedCommuteInput,
  options: AdapterOptions = {},
) {
  const data = await accountJsonRequest<AccountSavedCommute>(
    `/api/account/commutes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
    options,
  );
  return normalizeSavedCommute(data);
}

export async function deleteSavedCommute(id: string, options: AdapterOptions = {}) {
  await accountEmptyRequest(
    `/api/account/commutes/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    options,
  );
}
