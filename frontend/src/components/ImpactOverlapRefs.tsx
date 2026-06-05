"use client";

import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  PlannedClosure,
  ReducedSpeedZone,
} from "../app/linewatch-data";
import { formatCompactLocation } from "./ImpactCardFields";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

type CurrentImpact = {
  kind: ImpactKind;
  id: string;
  segmentIds: string[];
};

type OverlapSourceData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
};

export type OverlappingImpactRef = {
  key: string;
  kind: ImpactKind;
  label: string;
  location: string;
  selection: NonNullable<ImpactSelection>;
};

function impactKindForActiveAlert(alert: ActiveAlert): ImpactKind {
  if (alert.severity === "planned") return "planned-closure";
  if (alert.severity === "delay") return "delay";
  return "suspension";
}

function labelForActiveAlert(alert: ActiveAlert): string {
  if (alert.severity === "planned") return "Active Closure";
  if (alert.severity === "delay") return "Delay";
  return "Active Alert";
}

function segmentsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const aIds = new Set(a);
  return b.some((segmentId) => aIds.has(segmentId));
}

export function getOverlappingImpactRefs(
  currentImpact: CurrentImpact,
  data: OverlapSourceData,
): OverlappingImpactRef[] {
  const refs: OverlappingImpactRef[] = [];
  const seen = new Set<string>();

  const addRef = (ref: OverlappingImpactRef, segmentIds: string[]) => {
    if (ref.selection.kind === currentImpact.kind && ref.selection.id === currentImpact.id) {
      return;
    }
    if (!segmentsOverlap(currentImpact.segmentIds, segmentIds)) {
      return;
    }
    if (seen.has(ref.key)) {
      return;
    }
    seen.add(ref.key);
    refs.push(ref);
  };

  for (const alert of data.activeAlerts) {
    const kind = impactKindForActiveAlert(alert);
    addRef(
      {
        key: `${kind}-${alert.id}`,
        kind,
        label: labelForActiveAlert(alert),
        location: alert.location,
        selection: { kind, id: alert.id },
      },
      alert.affectedSegmentIds ?? [],
    );
  }

  for (const closure of data.plannedClosures) {
    addRef(
      {
        key: `planned-closure-${closure.id}`,
        kind: "planned-closure",
        label: "Upcoming Closure",
        location: closure.location,
        selection: { kind: "planned-closure", id: closure.id },
      },
      closure.previewSegmentIds ?? [],
    );
  }

  for (const delay of data.delays) {
    addRef(
      {
        key: `delay-${delay.id}`,
        kind: "delay",
        label: "Delay",
        location: delay.location,
        selection: { kind: "delay", id: delay.id },
      },
      delay.affectedSegmentIds ?? [],
    );
  }

  for (const zone of data.reducedSpeedZones) {
    addRef(
      {
        key: `reduced-speed-zone-${zone.id}`,
        kind: "reduced-speed-zone",
        label: "Reduced Speed Zone",
        location: zone.location,
        selection: { kind: "reduced-speed-zone", id: zone.id },
      },
      zone.affectedSegmentIds ?? [],
    );
  }

  return refs;
}

export function OverlappingImpactRefs({
  overlaps,
  onSelectImpact,
  label = "Overlapping:",
}: {
  overlaps: OverlappingImpactRef[];
  onSelectImpact: (selection: ImpactSelection) => void;
  label?: string;
}) {
  if (overlaps.length === 0) return null;

  return (
    <div className="text-[11px] mt-2 font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 border border-black/5 dark:border-white/5 px-2 py-1 rounded-md w-fit flex gap-1 items-start">
      <span className="font-bold text-amber-600 dark:text-amber-400 mr-1 shrink-0 mt-[5px]">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {overlaps.map((overlap) => (
          <button
            key={overlap.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectImpact(overlap.selection);
            }}
            className={`overlap-impact-ref ${overlap.kind}`}
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
