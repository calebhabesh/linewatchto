"use client";

import { commuteImpacts } from "../app/linewatch-data";
import { Navigation, CheckCircle2, AlertCircle, AlertOctagon } from "lucide-react";

export function SavedCommutesPanel() {
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
      <span className={`status-pill inline-flex px-2 py-0.5 text-xs font-bold rounded-full ${classes}`}>
        {label}
      </span>
    );
  };

  return (
    <section className="commute-panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Navigation size={18} className="text-emerald-500" />
          Saved Commute Impacts
        </h2>
      </div>
      <div className="commute-grid p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {commuteImpacts.map((commute) => {
          const impactClass = getImpactClass(commute.impact);
          return (
            <div
              key={commute.id}
              className={`commute-card border-l-4 ${impactClass} p-3 rounded-lg bg-black/5 dark:bg-white/5 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                    {commute.name}
                  </h3>
                  {getImpactIcon(commute.impact)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                  {commute.route}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  {commute.detail}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                {getImpactPill(commute.impact, commute.statusLabel)}
                {commute.affectedBy && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
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
