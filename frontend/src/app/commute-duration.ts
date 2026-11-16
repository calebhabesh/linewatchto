import { formatStationSpanText, parseStationSpan } from "./station-span.ts";

function minutesFromSeconds(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

const RANGE_SEPARATOR = "\u00a0–\u00a0";

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

export function formatEstimateDuration(seconds: number | null | undefined) {
  const minutes = minutesFromSeconds(seconds);
  return minutes === 0 ? "Unavailable" : formatDurationMinutes(minutes);
}

export function formatEstimateRange(
  lowSeconds: number | null | undefined,
  highSeconds: number | null | undefined,
) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "Unavailable";
  if (low === 0) return formatDurationMinutes(high);
  if (low === high || high === 0) return formatDurationMinutes(low);
  return `${formatDurationMinutes(low)}${RANGE_SEPARATOR}${formatDurationMinutes(high)}`;
}

export function formatExtraTimeRange(
  lowSeconds: number | null | undefined,
  highSeconds: number | null | undefined,
) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "+0 min";
  if (low === high || high === 0) return `+${formatDurationMinutes(low)}`;
  if (low < 60 && high < 60) return `+${low}${RANGE_SEPARATOR}${high} min`;
  return `+${formatDurationMinutes(low)}${RANGE_SEPARATOR}${formatDurationMinutes(high)}`;
}

type TravelTimeHeadlineEstimate = {
  status: "standard" | "estimated" | "unreliable" | "unavailable";
  baselineSeconds: number;
  estimatedLowSeconds: number | null;
  estimatedHighSeconds: number | null;
  confidence: string;
};

export function formatConfidenceLabel(confidence: string | null | undefined) {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
    default: {
      const normalized = confidence?.trim();
      return normalized
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
        : "Unknown";
    }
  }
}

type RouteConditionImpact = {
  kind: string;
  status: string;
  serviceEffect?: string | null;
  lineNumber: string | null;
  location: string | null;
  displayLocation?: string | null;
  displayDirection: string | null;
  ignoredByRule?: boolean;
};

export type ReportedRouteCondition = {
  /** What the feed reports on the route: "Suspension", "Closure" or "Limited Service". */
  label: "Suspension" | "Closure" | "Limited Service";
  /**
   * What that means on the stretch it covers, for the line under the headline:
   * "No Trains: Victoria Park ⇄ Kennedy" (suspension or closure) or "Fewer
   * Trains: …" (limited service); "… on Part of Route" without a stretch.
   */
  context: string;
};

function conditionLabel(impact: RouteConditionImpact): ReportedRouteCondition["label"] | null {
  if (impact.serviceEffect === "limited-service") return "Limited Service";
  if (impact.kind === "suspension") return "Suspension";
  if (impact.kind === "planned-closure") return "Closure";
  return null;
}

const CONDITION_ORDER: ReportedRouteCondition["label"][] = ["Suspension", "Closure", "Limited Service"];

/**
 * The service condition behind a travel time the backend won't estimate
 * ("unreliable": a current suspension, closure in effect, or limited service on
 * the route), so the card can say what is happening rather than how sure it is.
 * Monitored impacts lead; one the commute's filters ignore still explains it.
 */
export function reportedRouteCondition(impacts: readonly RouteConditionImpact[]): ReportedRouteCondition | null {
  const current = impacts.filter((impact) => impact.status === "current" && conditionLabel(impact));
  const ranked = [...current].sort((left, right) =>
    Number(Boolean(left.ignoredByRule)) - Number(Boolean(right.ignoredByRule))
    || CONDITION_ORDER.indexOf(conditionLabel(left)!) - CONDITION_ORDER.indexOf(conditionLabel(right)!));
  const impact = ranked[0];
  if (!impact) return null;
  const location = impact.displayLocation?.trim() || impact.location?.trim() || null;
  const span = location ? parseStationSpan(location, impact.displayDirection) : null;
  const place = span ? formatStationSpanText(span) : location;
  const label = conditionLabel(impact)!;
  const effect = label === "Limited Service" ? "Fewer Trains" : "No Trains";
  return { label, context: place ? `${effect}: ${place}` : `${effect} on Part of Route` };
}

/**
 * The Travel Time box's "With Impacts" value when no estimate is given: a
 * suspension or closure blocks the route; limited service slows it by an
 * unknown amount.
 */
export function routeConditionVerdict(condition: ReportedRouteCondition | null): string {
  switch (condition?.label) {
    case "Suspension":
    case "Closure":
      return "Route Blocked";
    case "Limited Service":
      return "Extra Time Unknown";
    default:
      return "No Estimate";
  }
}

export function formatTravelTimeHeadline(
  estimate: TravelTimeHeadlineEstimate,
  condition: ReportedRouteCondition | null = null,
) {
  switch (estimate.status) {
    case "estimated":
      return {
        value: formatEstimateRange(estimate.estimatedLowSeconds, estimate.estimatedHighSeconds),
        context: `Estimated Now · ${formatConfidenceLabel(estimate.confidence)} Confidence`,
      };
    case "standard":
      return {
        value: `About ${formatEstimateDuration(estimate.baselineSeconds)}`,
        context: "Typical Scheduled Time",
      };
    case "unreliable":
      // Say what the feed reports on the route, and where; no duration is given.
      return condition
        ? { value: `${condition.label} on Route`, context: condition.context }
        : { value: "Service Disrupted on Route", context: "No Travel Time Estimate" };
    case "unavailable":
      return {
        value: "Estimate Unavailable",
        context: "No Route Time Available",
      };
  }
}
