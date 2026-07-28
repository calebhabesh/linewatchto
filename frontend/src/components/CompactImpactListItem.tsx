import type { ReactNode } from "react";
import { CompactImpactLocation, JumpToLocationIcon, LineBadge } from "./ImpactCardFields";
import { ImpactTimestamp } from "./ImpactTimestamp";

export type CompactImpactFact = {
  label: string;
  value: ReactNode;
  column: 1 | 2 | 3 | 4;
};

export function CompactImpactTimeValue({
  timestamp,
  fallback,
}: {
  timestamp?: string | null;
  fallback?: string | null;
}) {
  if (timestamp) return <ImpactTimestamp timestamp={timestamp} />;
  return <>{fallback?.replace(/^Updated\s+/i, "") || "Not reported"}</>;
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
  active,
  toneClassName,
  onShowOnMap,
}: Props) {
  return (
    <button
      type="button"
      data-impact-card-id={impactId}
      className={`compact-impact-list-item ${toneClassName}${active ? " is-active" : ""}`}
      onClick={onShowOnMap}
      aria-label={`Show ${title} on map: ${location}`}
    >
      <LineBadge lineId={lineId} lineNumber={lineNumber} />
      <span className="compact-impact-list-item__body">
        <span className="compact-impact-list-item__heading">
          <strong>{title}</strong>
          {status ? <span className="compact-impact-list-item__status">{status}</span> : null}
        </span>
        <span className="compact-impact-list-item__location">
          <CompactImpactLocation location={location} />
          {direction ? (
            <span className="compact-impact-list-item__direction">
              <span className="compact-impact-list-item__key">Direction:</span> {direction}
            </span>
          ) : null}
        </span>
      </span>
      <span className="compact-impact-list-item__map-action" aria-hidden="true">
        <JumpToLocationIcon className="w-5 h-5" />
      </span>
      {facts.length > 0 ? (
        <span className="compact-impact-list-item__detail">
          <span className="compact-impact-list-item__facts">
            {facts.map((fact) => (
              <span
                className={`compact-impact-list-item__fact is-column-${fact.column}`}
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
}
