import { Ban, Moon, TriangleAlert } from "lucide-react";
import { plannedAdvisoryEffect } from "../app/alert-categories";
import type { IncidentRiderDetails } from "../app/linewatch-data";

/** States whether a planned advisory closes the line or keeps limited service running. */
export function PlannedEffectBadge({ incident, planned = false }: { incident: IncidentRiderDetails; planned?: boolean }) {
  const effect = plannedAdvisoryEffect(incident);
  if (!effect) return null;
  const label = effect === "closure" ? "Closure" : "Limited Service";
  const Icon = effect === "closure" ? Ban : TriangleAlert;
  return (
    <span className={`impact-card-effect-badge ${effect}`}>
      <Icon size={12} aria-hidden="true" />
      {planned ? `Planned ${label}` : label}
    </span>
  );
}

export function NightlyBadge() {
  return (
    <span className="impact-card-service-badge nightly">
      <Moon size={11} aria-hidden="true" />
      Nightly
    </span>
  );
}
