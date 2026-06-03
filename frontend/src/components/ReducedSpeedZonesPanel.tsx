"use client";


import { useDashboardData } from "../app/DataContext";
import { Construction, ChevronLeft, Eye, EyeOff } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource } from "./ImpactCardFields";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
}

export function ReducedSpeedZonesPanel({
  selection,
  onSelectImpact,
  onBack,
}: Props) {
  const { reducedSpeedZones } = useDashboardData();
  useScrollSelectedImpactCard(selection, "reduced-speed-zone");

  const handleReducedSpeedZoneClick = (alertId: string) => {
    onSelectImpact(
      selection?.kind === "reduced-speed-zone" && selection.id === alertId
        ? null
        : { kind: "reduced-speed-zone", id: alertId },
    );
  };

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-1 sm:p-2 -ml-1 sm:-ml-3 mr-0 sm:mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <Construction className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-amber-500 shrink-0" />
            <span>Reduced Speed Zones</span>
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1 mt-0.5 shrink-0">
          <span className="shrink-0 text-[9px] sm:text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
            {reducedSpeedZones.length} {reducedSpeedZones.length === 1 ? "Zone" : "Zones"}
          </span>
          <CardSource source={reducedSpeedZones[0]?.source || "TTC Live Alerts"} />
        </div>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {reducedSpeedZones.map((zone) => {
          const isActive = selection?.kind === "reduced-speed-zone" && selection.id === zone.id;
          return (
            <div
              key={zone.id}
              data-impact-card-id={zone.id}
              className={`alert-card min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 border-l-amber-500 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                isActive ? "!bg-amber-50 dark:!bg-amber-950" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <LineBadge lineId={zone.lineId} lineNumber={zone.lineNumber} />
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words mt-0.5">
                    {zone.title}
                  </strong>
                </div>
              </div>

              <ImpactRouteHeader 
                location={zone.location} 
                direction={zone.displayDirection}
              />

              <MetadataGrid 
                cause={zone.cause}
                resolution={zone.resolution}
                reason={zone.reason} 
                targetRemoval={zone.targetRemoval} 
                startedAt={zone.startedAt}
                updatedAt={zone.updatedAt}
                updatedAgo={zone.updatedAgo} 
                extraRows={[
                  { label: "Reduced speed", value: zone.reducedSpeed ? `${zone.reducedSpeed} km/h` : null },
                  { label: "Average speed", value: zone.averageSpeed ? `${zone.averageSpeed} km/h` : null },
                ]}
              />

              <button
                onClick={() => handleReducedSpeedZoneClick(zone.id)}
                className={`preview-button mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border whitespace-normal ${
                  isActive
                    ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                }`}
              >
                {isActive ? (
                  <>
                    <EyeOff size={14} />
                    Clear Highlight
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    Highlight on Map
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
