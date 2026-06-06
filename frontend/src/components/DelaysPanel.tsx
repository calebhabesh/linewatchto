"use client";

import { ChevronLeft, X } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { ImpactRouteHeader, LineBadge, MetadataGrid, CardSource, JumpToLocationIcon } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export function DelaysPanel({ selection, onSelectImpact, onBack, onClose }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  useScrollSelectedImpactCard(selection, "delay");

  const handleDelayClick = (delayId: string) => {
    onSelectImpact(
      selection?.kind === "delay" && selection.id === delayId
        ? null
        : { kind: "delay", id: delayId },
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
            <DelayIcon size={16} className="delay-tone w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] shrink-0" />
            <span>Delays</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1 mt-0.5 min-w-0">
            <span className="delay-count-badge shrink-0 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
              {delays.length} {delays.length === 1 ? "Delay" : "Delays"}
            </span>
            <CardSource source={delays[0]?.source || "TTC Live Alerts"} />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
            </button>
          )}
        </div>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {delays.map((delay) => {
          const isActive = selection?.kind === "delay" && selection.id === delay.id;
          const overlappingImpacts = getOverlappingImpactRefs(
            { kind: "delay", id: delay.id, segmentIds: delay.affectedSegmentIds ?? [] },
            { activeAlerts, delays, reducedSpeedZones, plannedClosures },
          );
          return (
            <article
              key={delay.id}
              data-impact-card-id={delay.id}
              className={`alert-card delay-card-border min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <LineBadge lineId={delay.lineId} lineNumber={delay.lineNumber} />
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words mt-0.5">
                    {delay.title}
                  </strong>
                </div>
              </div>

              <ImpactRouteHeader location={delay.location} direction={delay.displayDirection} />

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {delay.description}
              </p>

              <OverlappingImpactRefs
                overlaps={overlappingImpacts}
                onSelectImpact={onSelectImpact}
                label="Overlapping:"
              />

              <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                <div className="flex-1 min-w-0">
                  <MetadataGrid
                    className="no-border"
                    cause={delay.cause}
                    startedAt={delay.startedAt}
                    updatedAt={delay.updatedAt}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDelayClick(delay.id)}
                  className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? "bg-slate-600 text-white border-slate-700 hover:bg-slate-700 dark:bg-slate-500 dark:border-slate-600 dark:hover:bg-slate-400 shadow-[0_0_12px_rgba(100,116,139,0.3)]"
                      : "bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700"
                  }`}
                >
                  <JumpToLocationIcon className="w-8 h-8" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight mt-1.5 max-w-[72px] whitespace-normal break-words">
                    {isActive ? "Unfocus" : "Show on Map"}
                  </span>
                </button>
              </div>


            </article>
          );
        })}
      </div>
    </section>
  );
}
