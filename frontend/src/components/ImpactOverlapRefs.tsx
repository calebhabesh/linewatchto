"use client";

import type {
  ImpactSelection,
} from "../app/linewatch-data";
import { formatCompactLocation } from "./ImpactCardFields";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import {
  getOverlappingImpactRefs,
  type OverlappingImpactRef,
} from "./impact-overlap-refs";

export { getOverlappingImpactRefs };
export type { OverlappingImpactRef };

export function OverlappingImpactRefs({
  overlaps,
  onSelectImpact,
  label = "Overlap:",
}: {
  overlaps: OverlappingImpactRef[];
  onSelectImpact: (selection: ImpactSelection) => void;
  label?: string;
}) {
  if (overlaps.length === 0) return null;

  return (
    <div className="impact-overlap-refs">
      <span className="impact-overlap-refs__label">{label}</span>
      <div className="impact-overlap-ref-list">
        {overlaps.map((overlap) => (
          <button
            key={overlap.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectImpact(overlap.selection);
            }}
            className={`overlap-impact-ref ${overlap.kind}`}
            aria-label={`View ${overlap.label} at ${formatCompactLocation(overlap.location)}`}
          >
            <ImpactTypeIcon kind={overlap.kind} size={12} className="mt-0.5 shrink-0" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span>{overlap.label}</span>
              <span className="overlap-impact-location truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {formatCompactLocation(overlap.location)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
