import type { ImpactKind, IncidentRiderDetails } from "./linewatch-data.ts";

/** Display buckets; persisted preferences and route keys remain compatible. */
export const ALERT_CATEGORIES: Record<ImpactKind, { label: string; singular: string }> = {
  suspension: { label: "Suspensions", singular: "Suspension" },
  delay: { label: "Delays", singular: "Delay" },
  "planned-closure": { label: "Planned Advisories", singular: "Planned Advisory" },
  "reduced-speed-zone": { label: "Reduced Speed Zones", singular: "Reduced Speed Zone" },
};

export function serviceEffectLabel(incident: IncidentRiderDetails, planned = false): string {
  if (incident.serviceEffect === "limited-service") return planned ? "Planned limited service" : "Limited service";
  return planned ? ALERT_CATEGORIES["planned-closure"].singular : ALERT_CATEGORIES.delay.singular;
}

export function currentAdvisoryBucket(incident: IncidentRiderDetails): "delay" | "suspension" {
  return incident.serviceEffect === "limited-service" || incident.serviceEffect === "delay" ? "delay" : "suspension";
}
