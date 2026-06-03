"use client";

import { useDashboardData } from "../app/DataContext";
import { Navigation, CheckCircle2, AlertCircle, AlertOctagon, ChevronLeft } from "lucide-react";

interface Props {
  onBack?: () => void;
}

export function SavedCommutesPanel({ onBack }: Props = {}) {
  const { commuteImpacts } = useDashboardData();
  const getImpactClass = (impact: string) => {
    switch (impact) {
      case "suspended":
      case "major":
        return "danger border-l-red-500";
      case "minor":
      case "planned":
        return "warning border-l-amber-500";
      default:
        return "ok border-l-green-500";
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case "suspended":
      case "major":
        return <AlertOctagon size={16} className="text-red-500" />;
      case "minor":
      case "planned":
        return <AlertCircle size={16} className="text-amber-500" />;
      default:
        return <CheckCircle2 size={16} className="text-green-500" />;
    }
  };

  const getImpactPill = (impact: string, label: string) => {
    let classes = "bg-slate-500/10 text-slate-500";
    if (impact === "suspended" || impact === "major") {
      classes = "bg-red-500/10 text-red-600 dark:text-red-400";
    } else if (impact === "minor" || impact === "planned") {
      classes = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    } else if (impact === "clear") {
      classes = "bg-green-500/10 text-green-600 dark:text-green-400";
    }

    return (
      <span className={`status-pill inline-flex shrink-0 px-2 py-0.5 text-xs font-bold rounded-full ${classes}`}>
        {label}
      </span>
    );
  };

  return (
    <section className="commute-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
            <Navigation className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" />
            <span>Saved Commutes</span>
          </h2>
        </div>
      </div>
      <div className="commute-grid min-w-0 p-3 grid grid-cols-1 gap-3">
        {commuteImpacts.map((commute) => {
          const impactClass = getImpactClass(commute.impact);
          const hasImpact = commute.impact !== "clear";
          return (
            <div
              key={commute.id}
              className={`commute-card min-w-0 border-l-4 ${impactClass} p-3 rounded-lg border border-black/10 dark:border-white/10 flex flex-col justify-between ${
                hasImpact ? "!bg-orange-50 dark:!bg-orange-950" : "!bg-slate-50 dark:!bg-[#12151c]"
              }`}
            >
              <div>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                    {commute.name}
                  </h3>
                  <span className="shrink-0 mt-0.5">{getImpactIcon(commute.impact)}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">
                  {commute.route}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed whitespace-normal break-words">
                  {commute.detail}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
                {getImpactPill(commute.impact, commute.statusLabel)}
                {commute.affectedBy && (
                  <span className="min-w-0 text-[10px] text-slate-400 dark:text-slate-500 italic whitespace-normal break-words">
                    via {commute.affectedBy}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
