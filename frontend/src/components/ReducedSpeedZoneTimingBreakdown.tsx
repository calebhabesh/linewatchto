import type { ReducedSpeedZone } from "../app/linewatch-data";
import {
  reducedSpeedZoneTimingEntries,
  type ReducedSpeedZoneTimingField,
} from "../app/reduced-speed-zone-timing";
import { ImpactTimestamp } from "./ImpactTimestamp";
import { ReducedSpeedZoneDirectionTextArrow } from "./DirectionalZoneCount";

export function ReducedSpeedZoneTimingBreakdown({
  zone,
  field,
}: {
  zone: ReducedSpeedZone;
  field: ReducedSpeedZoneTimingField;
}) {
  const entries = reducedSpeedZoneTimingEntries(zone, field);
  if (entries.length === 0) return null;

  return (
    <span className="rsz-timing-breakdown" role="list">
      {entries.map(({ direction, timestamp, count }) => (
        <span key={direction} className="rsz-timing-row" role="listitem">
          <span className="sr-only">{direction}: </span>
          <ReducedSpeedZoneDirectionTextArrow direction={direction} lineId={zone.lineId} />
          <ImpactTimestamp timestamp={timestamp} />
          <strong className="rsz-timing-count">({count})</strong>
        </span>
      ))}
    </span>
  );
}
