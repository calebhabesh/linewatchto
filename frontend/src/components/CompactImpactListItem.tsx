import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { CompactImpactLocation, JumpToLocationIcon, LineBadge } from "./ImpactCardFields";
import { ImpactTimestamp } from "./ImpactTimestamp";

export type CompactImpactFact = {
  label: string;
  value: ReactNode;
  column?: number;
  emphasized?: boolean;
};

export function CompactImpactTimeValue({
  timestamp,
  fallback,
}: {
  timestamp?: string | null;
  fallback?: string | null;
}) {
  if (timestamp) return <ImpactTimestamp timestamp={timestamp} />;
  return (
    <span className="impact-timestamp">
      {fallback?.replace(/^Updated\s+/i, "") || "Not Reported"}
    </span>
  );
}

type Props = {
  impactId: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  direction?: string | null;
  facts?: CompactImpactFact[];
  status?: ReactNode;
  locationFirst?: boolean;
  hideTypeLabel?: boolean;
  details?: ReactNode;
  active: boolean;
  toneClassName: string;
  onShowOnMap: () => void;
};

export function CompactImpactListItem({
  impactId,
  lineId,
  lineNumber,
  title,
  location,
  direction,
  facts = [],
  status,
  locationFirst = false,
  hideTypeLabel = false,
  details,
  active,
  toneClassName,
  onShowOnMap,
}: Props) {
  const omitTitle = hideTypeLabel && /^(planned closure|reduced speed zone|delay|service delay|service suspension|suspension|active alert)$/i.test(title.trim());
  const routeFirst = locationFirst || omitTitle;
  const renderedFacts: CompactImpactFact[] = direction
    ? [{ label: "Direction", value: direction }, ...facts]
    : facts;

  const content = (
    <button
      type="button"
      data-impact-card-id={details ? undefined : impactId}
      className={`compact-impact-list-item ${routeFirst ? "compact-impact-list-item--organized" : ""} ${toneClassName}${active ? " is-active" : ""}`}
      onClick={onShowOnMap}
      aria-label={active ? `Back to ${title} details: ${location}` : `Show ${title} on map: ${location}`}
      aria-pressed={active}
      title={active ? "Back to details" : "View on map"}
    >
      <LineBadge lineId={lineId} lineNumber={lineNumber} />
      <span className="compact-impact-list-item__body">
        <span className="compact-impact-list-item__heading">
          <strong>{routeFirst ? <CompactImpactLocation location={location} /> : title}</strong>
          {status ? <span className="compact-impact-list-item__status">{status}</span> : null}
        </span>
        {!omitTitle ? <span className="compact-impact-list-item__location">
          {routeFirst ? title : <CompactImpactLocation location={location} />}
        </span> : null}
      </span>
      <span className="compact-impact-list-item__map-action" aria-hidden="true">
        {active ? (
          <ArrowLeft className="compact-impact-list-item__map-action-icon" size={16} />
        ) : (
          <JumpToLocationIcon className="compact-impact-list-item__map-action-icon" />
        )}
        <span className="compact-impact-list-item__map-action-label">
          {active ? "Back" : "Map"}
        </span>
      </span>
      {renderedFacts.length > 0 ? (
        <span className="compact-impact-list-item__detail">
          <span className="compact-impact-list-item__facts">
            {renderedFacts.map((fact) => (
              <span
                className={`compact-impact-list-item__fact${fact.column ? ` is-column-${fact.column}` : ""}${fact.emphasized ? " is-emphasized" : ""}`}
                key={fact.label}
              >
                <span className="compact-impact-list-item__key">{fact.label}:</span> {fact.value}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </button>
  );
  if (!details) return content;
  return (
    <div
      data-impact-card-id={impactId}
      className={`compact-impact-list-item compact-impact-disclosure ${toneClassName}${active ? " is-active" : ""}`}
    >
      {content}
      <details className="compact-impact-disclosure__details">
        <summary>Details</summary>
        <div>{details}</div>
      </details>
    </div>
  );
}
