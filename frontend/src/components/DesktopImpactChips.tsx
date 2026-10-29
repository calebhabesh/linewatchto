import { AlertTriangle, Construction, Train } from "lucide-react";
import type { ImpactCategoryView } from "../app/navigation-transitions";
import type { NetworkId } from "../app/regional-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";

/** Desktop impact-category count chips beside the current service panel. */
export function DesktopImpactChips({
  selectedNetwork,
  suspensionCount,
  delayCount,
  plannedAdvisoryCount,
  reducedSpeedZoneCount,
  regionalTripChangeCount,
  openImpactCategory,
  openRegionalTripChanges,
}: {
  selectedNetwork: NetworkId;
  suspensionCount: number;
  delayCount: number;
  plannedAdvisoryCount: number;
  reducedSpeedZoneCount: number;
  regionalTripChangeCount: number | null;
  openImpactCategory: (view: ImpactCategoryView, lineId?: string) => void;
  openRegionalTripChanges: () => void;
}) {
  return (
    <div className="desktop-status-chip-row desktop-header-impact-chips" aria-label="Open impact categories">
      <button
        type="button"
        className="desktop-status-chip desktop-status-chip--alerts"
        data-count={suspensionCount === 0 ? "zero" : "positive"}
        onClick={() => openImpactCategory("alerts")}
        aria-label={`${suspensionCount} ${suspensionCount === 1 ? "suspension" : "suspensions"}`}
        title={`${suspensionCount} ${suspensionCount === 1 ? "Suspension" : "Suspensions"}`}
      >
        <AlertTriangle size={18} aria-hidden="true" />
        <span className="desktop-status-chip-count" data-digit-count={suspensionCount >= 10 ? "multiple" : "single"}>
          <span className="desktop-status-chip-count-value">{suspensionCount}</span>
        </span>
        <span className="desktop-status-chip-label">{suspensionCount === 1 ? "Suspension" : "Suspensions"}</span>
      </button>
      <button
        type="button"
        className="desktop-status-chip desktop-status-chip--delays"
        data-count={delayCount === 0 ? "zero" : "positive"}
        onClick={() => openImpactCategory("delays")}
        aria-label={`${delayCount} ${delayCount === 1 ? "delay" : "delays"}`}
        title={`${delayCount} ${delayCount === 1 ? "Delay" : "Delays"}`}
      >
        <DelayIcon size={18} aria-hidden="true" />
        <span className="desktop-status-chip-count" data-digit-count={delayCount >= 10 ? "multiple" : "single"}>
          <span className="desktop-status-chip-count-value">{delayCount}</span>
        </span>
        <span className="desktop-status-chip-label">{delayCount === 1 ? "Delay" : "Delays"}</span>
      </button>
      <button
        type="button"
        className="desktop-status-chip desktop-status-chip--closures"
        data-count={plannedAdvisoryCount === 0 ? "zero" : "positive"}
        onClick={() => openImpactCategory("closures")}
        aria-label={`${plannedAdvisoryCount} ${plannedAdvisoryCount === 1 ? "planned advisory" : "planned advisories"}`}
        title={`${plannedAdvisoryCount} ${plannedAdvisoryCount === 1 ? "Planned Advisory" : "Planned Advisories"}`}
      >
        <PlannedClosureIcon size={18} aria-hidden="true" />
        <span className="desktop-status-chip-count" data-digit-count={plannedAdvisoryCount >= 10 ? "multiple" : "single"}>
          <span className="desktop-status-chip-count-value">{plannedAdvisoryCount}</span>
        </span>
        <span className="desktop-status-chip-label">{plannedAdvisoryCount === 1 ? "Planned Advisory" : "Planned Advisories"}</span>
      </button>
      {selectedNetwork === "ttc" ? <button
        type="button"
        className="desktop-status-chip desktop-status-chip--reduced-speed-zone"
        data-count={reducedSpeedZoneCount === 0 ? "zero" : "positive"}
        onClick={() => openImpactCategory("reduced-speed-zones")}
        aria-label={`${reducedSpeedZoneCount} ${reducedSpeedZoneCount === 1 ? "reduced speed zone" : "reduced speed zones"}`}
        title={`${reducedSpeedZoneCount} ${reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}`}
      >
        <Construction size={18} aria-hidden="true" />
        <span className="desktop-status-chip-count" data-digit-count={reducedSpeedZoneCount >= 10 ? "multiple" : "single"}>
          <span className="desktop-status-chip-count-value">{reducedSpeedZoneCount}</span>
        </span>
        <span className="desktop-status-chip-label">
          {reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
        </span>
      </button> : null}
      {selectedNetwork === "regional" ? <button
        type="button"
        className="desktop-status-chip desktop-status-chip--trip-changes"
        data-count={(regionalTripChangeCount ?? 0) === 0 ? "zero" : "positive"}
        onClick={openRegionalTripChanges}
        aria-label={`${regionalTripChangeCount ?? 0} ${(regionalTripChangeCount ?? 0) === 1 ? "trip change" : "trip changes"}`}
        title={`${regionalTripChangeCount ?? 0} ${(regionalTripChangeCount ?? 0) === 1 ? "Trip Change" : "Trip Changes"}`}
      >
        <Train size={18} aria-hidden="true" />
        <span className="desktop-status-chip-count" data-digit-count={(regionalTripChangeCount ?? 0) >= 10 ? "multiple" : "single"}>
          <span className="desktop-status-chip-count-value">{regionalTripChangeCount ?? 0}</span>
        </span>
        <span className="desktop-status-chip-label">{(regionalTripChangeCount ?? 0) === 1 ? "Trip Change" : "Trip Changes"}</span>
      </button> : null}
    </div>
  );
}
