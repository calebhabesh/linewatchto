"use client";


import { useDashboardData } from "../app/DataContext";
import { Calendar, Eye, EyeOff, Bus, ChevronLeft } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource } from "./ImpactCardFields";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
}

export function PlannedClosuresPanel({ selection, onSelectImpact, onBack }: Props) {
  const { plannedClosures } = useDashboardData();
  useScrollSelectedImpactCard(selection, "planned-closure");

  const handleClosureClick = (closureId: string) => {
    onSelectImpact(
      selection?.kind === "planned-closure" && selection.id === closureId
        ? null
        : { kind: "planned-closure", id: closureId },
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
            <Calendar className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-blue-500 shrink-0" />
            <span>Upcoming Closures</span>
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1 mt-0.5 shrink-0">
          <span className="shrink-0 text-[9px] sm:text-xs bg-blue-500/10 text-blue-500 px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
            {plannedClosures.length} Upcoming
          </span>
          <CardSource source={plannedClosures[0]?.source || "TTC Live Alerts"} />
        </div>
      </div>
      <div className="closure-stack min-w-0 p-3 flex flex-col gap-2">
        {plannedClosures.map((closure) => {
          const isActive = selection?.kind === "planned-closure" && selection.id === closure.id;
          return (
            <div
              key={closure.id}
              data-impact-card-id={closure.id}
              className={`closure-card min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/10 dark:border-white/10 transition-all ${
                isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <LineBadge lineId={closure.lineId} lineNumber={closure.lineNumber} />
                  <div className="flex flex-col items-start min-w-0">
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words mt-0.5">
                      {closure.title}
                    </strong>
                    <div className="max-w-full text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2 bg-blue-500/5 dark:bg-blue-500/10 px-2 py-0.5 rounded-md inline-block whitespace-normal break-words">
                      {closure.window}
                    </div>
                    {closure.activeNow && closure.activeWindowLabel && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold mt-1">
                        Current closure window: {closure.activeWindowLabel}
                      </p>
                    )}
                    {!closure.activeNow && closure.nextWindowLabel && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Next closure window: {closure.nextWindowLabel}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {closure.activeNow && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-500/10 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Active now
                    </span>
                  )}
                  {closure.nightly && (
                    <span className="flex items-center gap-1 text-[10px] bg-slate-500/10 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold uppercase">
                      Nightly
                    </span>
                  )}
                  {closure.shuttle && (
                    <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                      <Bus size={10} />
                      Shuttle
                    </span>
                  )}
                </div>
              </div>

              <ImpactRouteHeader location={closure.location} />
              
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {closure.description}
              </p>

              <MetadataGrid 
                cause={closure.cause}
                resolution={closure.resolution}
                reason={closure.reason} 
                targetRemoval={closure.targetRemoval} 
                startedAt={closure.startedAt}
                updatedAt={closure.updatedAt}
                updatedAgo={closure.updatedAgo} 
              />

              <button
                onClick={() => handleClosureClick(closure.id)}
                className={`preview-button mt-3 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border whitespace-normal ${
                  isActive
                    ? "bg-blue-500 text-white border-blue-600 hover:bg-blue-600"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
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
