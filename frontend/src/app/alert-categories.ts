import type { ImpactKind, IncidentRiderDetails } from "./linewatch-data.ts";

/** The canonical name of a planned closure in effect, on every card, panel, chooser and list. */
export const PLANNED_CLOSURE_IN_EFFECT = "Planned Closure · In Effect";

/** "1 Planned Closure · In Effect", "2 Planned Closures · In Effect". */
export function plannedClosuresInEffectCountLabel(count: number) {
  return `${count} Planned Closure${count === 1 ? "" : "s"} · In Effect`;
}

/** Display buckets; persisted preferences and route keys remain compatible. */
export const ALERT_CATEGORIES: Record<ImpactKind, { label: string; singular: string }> = {
  suspension: { label: "Suspensions", singular: "Suspension" },
  delay: { label: "Delays", singular: "Delay" },
  "planned-closure": { label: "Planned Advisories", singular: "Planned Advisory" },
  "reduced-speed-zone": { label: "Reduced Speed Zones", singular: "Reduced Speed Zone" },
};

export function serviceEffectLabel(incident: IncidentRiderDetails, planned = false): string {
  if (incident.serviceEffect === "limited-service") return planned ? "Planned Limited Service" : "Limited Service";
  return planned ? ALERT_CATEGORIES["planned-closure"].singular : ALERT_CATEGORIES.delay.singular;
}

export function currentAdvisoryBucket(incident: IncidentRiderDetails): "delay" | "suspension" {
  return incident.serviceEffect === "limited-service" || incident.serviceEffect === "delay" ? "delay" : "suspension";
}

/** The rider-facing effect of a planned advisory, or null when the source does not establish one. */
export function plannedAdvisoryEffect(incident: IncidentRiderDetails): "closure" | "limited-service" | null {
  if (incident.serviceEffect === "suspension") return "closure";
  if (incident.serviceEffect === "limited-service") return "limited-service";
  return null;
}
