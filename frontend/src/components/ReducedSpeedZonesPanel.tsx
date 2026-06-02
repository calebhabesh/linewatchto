"use client";


import { useDashboardData } from "../app/DataContext";
import { Construction, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { LineBadge, ImpactRouteHeader, MetadataGrid } from "./ImpactCardFields";

interface Props {
  selectedAlertId?: string | null;
  onSelectAlertId?: (id: string | null) => void;
  onBack?: () => void;
}

export function ReducedSpeedZonesPanel({
  selectedAlertId,
  onSelectAlertId,
  onBack,
}: Props) {
  const { reducedSpeedZones } = useDashboardData();

  const handleReducedSpeedZoneClick = (alertId: string) => {
    onSelectAlertId?.(selectedAlertId === alertId ? null : alertId);
  };

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3 whitespace-nowrap">
            <Construction size={22} className="text-amber-500 shrink-0" />
            Reduced Speed Zones
          </h2>
        </div>
        <span className="shrink-0 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
          {reducedSpeedZones.length} {reducedSpeedZones.length === 1 ? "Zone" : "Zones"}
        </span>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {reducedSpeedZones.map((zone) => {
          const isActive = selectedAlertId === zone.id;
          return (
            <div
              key={zone.id}
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
                direction={
                  zone.displayDirection === "Both Directions" && zone.directionalDetails?.length > 1 
                    ? zone.directionalDetails.map(d => d.displayDirection).join(" & ") 
                    : zone.displayDirection
                } 
              />

              <MetadataGrid 
                reason={zone.reason} 
                targetRemoval={zone.targetRemoval} 
                source={zone.source} 
                updatedAgo={zone.updatedAgo} 
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
