import type { ReactNode } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { OverlappingCountBadge } from "./OverlappingCountBadge";

export { groupStationDisruptions } from "./station-disruption-headline";

type StationDisruptionBadge = {
  key: string;
  label: string;
  count: number;
  icon: ReactNode;
};

type StationDisruptionSummaryProps = {
  badges: StationDisruptionBadge[];
  /** Title Case; a surface stop can say what its notices actually cover. */
  title?: string;
  onJump?: (origin: HTMLElement) => void;
};

export function StationDisruptionSummary({ badges, title = "Schedule May Be Disrupted", onJump }: StationDisruptionSummaryProps) {
  const heading = (
    <span className="station-banner-heading station-disruption-heading">
      <AlertCircle size={19} className="station-banner-heading-icon animate-terminating-blink" aria-hidden="true" />
      <span>{title}</span>
    </span>
  );

  if (badges.length === 0) {
    return (
      <div className="station-detail-disruption-card" data-station-disruption-warning>
        {heading}
      </div>
    );
  }

  const summary = badges.map((badge) => `${badge.label} (${badge.count})`).join(", ");

  return (
    <button
      type="button"
      onClick={(event) => onJump?.(event.currentTarget)}
      className="station-detail-disruption-card"
      data-station-disruption-warning
      aria-label={`${title.charAt(0)}${title.slice(1).toLowerCase()}: ${summary}. Press for details.`}
    >
      <span className="station-disruption-summary-main">
        {heading}
        <span className="station-disruption-divider" aria-hidden="true" />
        <span className="station-disruption-badges">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className="station-disruption-badge"
              title={`${badge.label} (${badge.count})`}
              aria-hidden="true"
            >
              {badge.icon}
              {badge.count > 1 && (
                <OverlappingCountBadge className="station-access-outage-count station-disruption-count" count={badge.count} />
              )}
            </span>
          ))}
        </span>
      </span>
      <span className="station-banner-details station-disruption-details">
        Details <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
      </span>
    </button>
  );
}
