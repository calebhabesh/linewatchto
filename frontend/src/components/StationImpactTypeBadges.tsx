import type { ImpactKind } from "../app/linewatch-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

const IMPACT_KIND_LABELS: Record<ImpactKind, string> = {
  suspension: "Suspension",
  delay: "Delay",
  "reduced-speed-zone": "Reduced Speed Zone",
  "planned-closure": "Planned Advisory",
};

export function StationImpactTypeBadges({ kinds }: { kinds: ImpactKind[] }) {
  if (kinds.length === 0) return null;

  const labels = kinds.map((kind) => IMPACT_KIND_LABELS[kind]);

  return (
    <span className="station-impact-type-badges" aria-label={`Current service impacts: ${labels.join(", ")}`}>
      {kinds.map((kind) => (
        <span
          key={kind}
          className={`station-impact-type-badge ${kind}`}
          title={IMPACT_KIND_LABELS[kind]}
          aria-label={IMPACT_KIND_LABELS[kind]}
        >
          <ImpactTypeIcon kind={kind} size={18} />
        </span>
      ))}
    </span>
  );
}
