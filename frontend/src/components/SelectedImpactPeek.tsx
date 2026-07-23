"use client";

import { X, ChevronUp, AlertTriangle, Construction, Calendar } from "lucide-react";
import { DelayIcon } from "./DelayIcon";
import type { DashboardData } from "../app/DataContext";
import type { ImpactSelection } from "../app/linewatch-data";
import { LineBadge } from "./ImpactCardFields";

type Props = {
  selection: NonNullable<ImpactSelection>;
  dashboardData: DashboardData;
  onUnfocus: () => void;
  onViewDetails: () => void;
};

export function SelectedImpactPeek({ selection, dashboardData, onUnfocus, onViewDetails }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = dashboardData;

  let impactData = null;
  let icon = <AlertTriangle size={16} className="text-red-500" />;
  let toneClass = "border-red-500/30 bg-red-50 dark:bg-red-950/20";

  switch (selection.kind) {
    case "suspension":
      impactData = activeAlerts.find((a) => a.id === selection.id);
      break;
    case "delay":
      impactData = delays.find((d) => d.id === selection.id);
      icon = <DelayIcon size={16} className="delay-tone" />;
      toneClass = "border-[#FEEC41]/30 bg-[#FEEC41]/8 dark:bg-[#FEEC41]/12";
      break;
    case "reduced-speed-zone":
      impactData = reducedSpeedZones.find((z) => z.id === selection.id);
      icon = <Construction size={16} className="text-[var(--impact-rsz)]" />;
      toneClass = "border-[var(--impact-rsz-border)] bg-[var(--impact-rsz-soft)]";
      break;
    case "planned-closure":
      impactData = plannedClosures.find((c) => c.id === selection.id) || activeAlerts.find(a => a.id === selection.id);
      icon = <Calendar size={16} className="text-blue-500" />;
      toneClass = "border-blue-500/30 bg-blue-50 dark:bg-blue-950/20";
      break;
  }

  if (!impactData) return null;

  return (
    <div className="absolute bottom-[calc(var(--mobile-bottom-nav-height)+var(--mobile-safe-bottom)+12px)] left-3 right-3 z-30 md:hidden pointer-events-auto">
      <div className={`flex flex-col gap-2 rounded-xl border p-3 shadow-xl backdrop-blur-md ${toneClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2 mt-0.5">
            <LineBadge lineId={impactData.lineId} lineNumber={impactData.lineNumber || impactData.lineId.replace("line-", "")} />
            <div className="flex flex-col min-w-0">
              <strong className="block min-w-0 text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words leading-snug">
                {impactData.title}
              </strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onUnfocus}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white/50 text-slate-700 transition-colors hover:bg-black/10 dark:border-white/10 dark:bg-black/20 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label="Unfocus impact"
          >
            <X size={18} />
          </button>
        </div>
        
        <button
          type="button"
          onClick={onViewDetails}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-black/10 bg-white/80 py-2 text-xs font-bold text-slate-800 shadow-sm transition-all hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-black/40 dark:text-slate-200 dark:hover:bg-black/60"
        >
          {icon}
          View in List
          <ChevronUp size={14} className="text-slate-500 ml-1" />
        </button>
      </div>
    </div>
  );
}
