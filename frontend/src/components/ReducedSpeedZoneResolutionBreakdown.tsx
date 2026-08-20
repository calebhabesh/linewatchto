import { normalizeReducedSpeedZoneDirection } from "../app/reduced-speed-zone-count";
import { reducedSpeedZoneResolutionEntries } from "../app/reduced-speed-zone-resolution";
import type { ReducedSpeedZone } from "../app/linewatch-data";
import { ReducedSpeedZoneDirectionTextArrow } from "./DirectionalZoneCount";

export function ReducedSpeedZoneResolutionBreakdown({ zone }: { zone: ReducedSpeedZone }) {
  const entries = reducedSpeedZoneResolutionEntries(zone);
  if (entries.length === 0) return null;

  return (
    <span className="rsz-resolution-breakdown">
      {entries.map(({ direction, resolution, count }) => (
        <span key={`${direction}-${resolution}`} className="rsz-resolution-row">
          <span className="sr-only">{direction}: </span>
          <ReducedSpeedZoneDirectionTextArrow
            direction={normalizeReducedSpeedZoneDirection(direction)}
            lineId={zone.lineId}
          />
          <span>{resolution}</span>{" "}
          <strong style={{ color: "#B8A66F" }}>({count})</strong>
        </span>
      ))}
    </span>
  );
}
