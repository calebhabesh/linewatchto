import type { DashboardData } from "./dashboard-contract";
import type { ImpactKind, ImpactSelection } from "./linewatch-data";
import type { NetworkId } from "./regional-data";

/**
 * Push notification taps carry what was notified; where the tap lands is decided
 * here, against the data the app holds when the tap arrives.
 */

export const NOTIFICATION_OPEN_MESSAGE = "linewatch-notification-open";
/** Longest a tap waits for its network's first verified dashboard before resolving. */
export const NOTIFICATION_TARGET_WAIT_MS = 8_000;

/** Params that only describe a notification target; removed once the tap is handled. */
export const NOTIFICATION_TARGET_PARAMS = [
  "impactKind",
  "impactId",
  "targetLine",
  "tripChangeId",
  "commute",
  "state",
] as const;

const IMPACT_KINDS: ReadonlySet<string> = new Set<ImpactKind>([
  "suspension",
  "delay",
  "reduced-speed-zone",
  "planned-closure",
]);
const TARGET_ID_PATTERN = /^[^\s<>"'`]{1,200}$/;

export type NotificationTargetState = "active" | "cleared";

export type NotificationTarget =
  | {
    type: "impact";
    network: NetworkId;
    selection: NonNullable<ImpactSelection>;
    lineId: string | null;
    state: NotificationTargetState;
  }
  | { type: "trip-change"; network: "regional"; tripChangeId: string; lineId: string | null }
  | { type: "commute"; network: NetworkId | null; commuteId: string; state: NotificationTargetState };

export type NotificationTapNoticeTone = "ended" | "unlisted" | "unconfirmed";

export type NotificationTapNotice = {
  tone: NotificationTapNoticeTone;
  title: string;
  message: string;
};

export type NotificationDestination =
  | { type: "wait" }
  | { type: "impact"; network: NetworkId; selection: NonNullable<ImpactSelection> }
  | {
    type: "alert-history";
    network: NetworkId;
    lineId: string | null;
    impactKind: ImpactKind;
    alertId: string;
    notice: NotificationTapNotice;
  }
  | { type: "line-impacts"; network: NetworkId; lineId: string; notice: NotificationTapNotice }
  | { type: "trip-changes"; tripChangeId: string; lineId: string | null }
  | { type: "commutes"; network: NetworkId | null; commuteId: string };

export type NotificationTargetContext = {
  dashboard: DashboardData;
  /** The target network has completed a dashboard request this session. */
  verified: boolean;
  waitExpired: boolean;
};

function validId(value: string | null): string | null {
  return value !== null && TARGET_ID_PATTERN.test(value) ? value : null;
}

export function parseNotificationTarget(params: URLSearchParams): NotificationTarget | null {
  const rawNetwork = params.get("network");
  const network: NetworkId | null = rawNetwork === "ttc" || rawNetwork === "regional" ? rawNetwork : null;
  const state: NotificationTargetState = params.get("state") === "cleared" ? "cleared" : "active";
  const lineId = validId(params.get("targetLine"));

  const impactKind = params.get("impactKind");
  const impactId = validId(params.get("impactId"));
  if (impactKind && IMPACT_KINDS.has(impactKind) && impactId) {
    return {
      type: "impact",
      network: network ?? "ttc",
      selection: { kind: impactKind as ImpactKind, id: impactId },
      lineId,
      state,
    };
  }

  const tripChangeId = validId(params.get("tripChangeId"));
  if (tripChangeId && params.get("panel") === "trip-changes") {
    return { type: "trip-change", network: "regional", tripChangeId, lineId };
  }

  const commuteId = validId(params.get("commute"));
  if (commuteId && params.get("panel") === "commutes") {
    return { type: "commute", network, commuteId, state };
  }

  return null;
}

/** Matches the lookups the impact inspector uses, so "found" means the inspector can render it. */
export function findNotificationImpact(
  selection: NonNullable<ImpactSelection>,
  data: Pick<DashboardData, "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures">,
): { lineId: string } | null {
  switch (selection.kind) {
    case "suspension":
      return data.activeAlerts.find((item) => item.id === selection.id) ?? null;
    case "delay":
      return data.delays.find((item) => item.id === selection.id)
        ?? data.activeAlerts.find((item) => item.id === selection.id && item.severity === "delay")
        ?? null;
    case "reduced-speed-zone":
      return data.reducedSpeedZones.find((item) => item.id === selection.id) ?? null;
    case "planned-closure":
      return data.plannedClosures.find((item) => item.id === selection.id) ?? null;
  }
}

/** Only fresh backend data may say an alert ended; snapshots and fixtures cannot. */
export function dashboardConfirmsCurrentService(dashboard: DashboardData): boolean {
  return dashboard.dataSource === "backend"
    && !dashboard.snapshot
    && (dashboard.availability === "available" || dashboard.availability === "degraded");
}

function endedNotice(kind: ImpactKind, network: NetworkId): NotificationTapNotice {
  const source = network === "regional" ? "GO / UP" : "TTC";
  if (kind === "planned-closure") {
    return {
      tone: "ended",
      title: "This closure has ended",
      message: `It's no longer listed in ${source} planned service changes.`,
    };
  }
  return {
    tone: "ended",
    title: "This alert has ended",
    message: `It's no longer listed in ${source} service alerts.`,
  };
}

const UNLISTED_ADVISORY_NOTICE: NotificationTapNotice = {
  tone: "unlisted",
  title: "This advisory is no longer listed",
  message: "GO / UP can remove an advisory before service is confirmed normal. Check GO Transit before travelling.",
};

function unconfirmedNotice(network: NetworkId): NotificationTapNotice {
  return {
    tone: "unconfirmed",
    title: "Couldn't confirm this alert",
    message: `Live ${network === "regional" ? "GO / UP" : "TTC"} data is unavailable, so its current status is unknown.`,
  };
}

export function resolveNotificationTarget(
  target: NotificationTarget,
  context: NotificationTargetContext,
): NotificationDestination {
  if (target.type === "trip-change") {
    // The trip-changes panel loads its own feed and reports a missing trip itself.
    return { type: "trip-changes", tripChangeId: target.tripChangeId, lineId: target.lineId };
  }
  if (target.type === "commute") {
    // Commute cards always show the commute's current state, cleared or not.
    return { type: "commutes", network: target.network, commuteId: target.commuteId };
  }

  if (!context.verified && !context.waitExpired) return { type: "wait" };

  const { network, selection } = target;
  // Current data wins over the notification's state: an impact still listed opens,
  // including one that re-opened or a closure with windows still ahead.
  const found = findNotificationImpact(selection, context.dashboard);
  if (found) return { type: "impact", network, selection };

  const lineId = target.lineId;
  if (!context.verified || !dashboardConfirmsCurrentService(context.dashboard)) {
    const notice = unconfirmedNotice(network);
    return lineId
      ? { type: "line-impacts", network, lineId, notice }
      : { type: "alert-history", network, lineId, impactKind: selection.kind, alertId: selection.id, notice };
  }

  if (network === "regional") {
    // An advisory window ending is not evidence that GO / UP service resumed.
    return lineId
      ? { type: "line-impacts", network, lineId, notice: UNLISTED_ADVISORY_NOTICE }
      : {
        type: "alert-history",
        network,
        lineId,
        impactKind: selection.kind,
        alertId: selection.id,
        notice: UNLISTED_ADVISORY_NOTICE,
      };
  }

  return {
    type: "alert-history",
    network,
    lineId,
    impactKind: selection.kind,
    alertId: selection.id,
    notice: endedNotice(selection.kind, network),
  };
}

/** The most recent history occurrence of the notified alert, if history recorded it. */
export function findNotifiedHistoryIncident<T extends { alertId: string; latestEventAt: string }>(
  incidents: readonly T[],
  alertId: string,
): T | null {
  let match: T | null = null;
  for (const incident of incidents) {
    if (incident.alertId !== alertId) continue;
    if (!match || Date.parse(incident.latestEventAt) > Date.parse(match.latestEventAt)) match = incident;
  }
  return match;
}
