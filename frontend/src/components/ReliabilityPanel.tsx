"use client";

import { useDashboardData } from "../app/DataContext";
import { BarChart3, ShieldCheck, ChevronLeft } from "lucide-react";

interface ReliabilityProps {
  onBack?: () => void;
}

export function ReliabilityPanel({ onBack }: ReliabilityProps = {}) {
  const { reliabilitySummaries } = useDashboardData();
  return (
    <section className="analytics-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 whitespace-nowrap">
            <BarChart3 size={22} className="text-purple-500 shrink-0" />
            Reliability Analytics (7-Day)
          </h2>
        </div>
      </div>
      <div className="reliability-list min-w-0 p-3 flex flex-col gap-2">
        {reliabilitySummaries.map((item) => (
          <div
            key={item.lineId}
            className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex flex-col justify-between gap-3"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className="line-badge shrink-0"
                style={{
                  backgroundColor: item.lineId === "line-1" ? "#f4c430" : item.lineId === "line-2" ? "#14a44d" : item.lineId === "line-4" ? "#b84ed8" : item.lineId === "line-5" ? "#f57c00" : "#969594",
                  color: item.lineId === "line-1" ? "#000000" : "#ffffff",
                }}
              >
                {item.lineNumber}
              </span>
              <div className="reliability-copy min-w-0">
                <strong className="text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                  {item.label}
                </strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                  {item.incidents7d} incidents • {item.medianDuration} median delay
                </span>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3 w-full">
              <div className="score-track flex-1 bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-green-500 h-full rounded-full"
                  style={{ width: `${item.score}%` }}
                />
              </div>
              <strong className="text-sm text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">
                {item.score}% Score
              </strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function IngestionHealthPanel() {
  const { ingestionHealth } = useDashboardData();
  return (
    <section className="health-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex min-w-0 items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-500" />
          Ingestion System Health
        </h2>
      </div>
      <div className="health-grid min-w-0 p-3 grid grid-cols-1 gap-3">
        {ingestionHealth.map((health, idx) => (
          <div
            key={idx}
            className="health-item min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex gap-3 items-start"
          >
            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mt-1.5" />
            <div className="min-w-0">
              <strong className="text-xs font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                {health.label}
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-normal break-words">
                {health.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
