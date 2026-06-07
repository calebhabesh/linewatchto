"use client";

import { useDashboardData } from "../app/DataContext";
import { BarChart3, ShieldCheck, ChevronLeft, X } from "lucide-react";

interface ReliabilityProps {
  onBack?: () => void;
  onClose?: () => void;
}

export function ReliabilityPanel({ onBack, onClose }: ReliabilityProps = {}) {
  const { ttcPerformance } = useDashboardData();
  const metrics = ttcPerformance.metrics;

  return (
    <section className="analytics-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
              <BarChart3 className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-purple-500 shrink-0" />
              <span>Official TTC Performance</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Source: {ttcPerformance.source} · Updated: {ttcPerformance.updatedLabel}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center" aria-label="Close">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        )}
      </div>
      <div className="reliability-list min-w-0 p-3 flex flex-col gap-2">
        {metrics.length === 0 ? (
          <div className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5">
            <strong className="text-sm font-bold text-slate-800 dark:text-white">Official metrics unavailable</strong>
            <p className="text-xs text-slate-500 dark:text-slate-400">{ttcPerformance.message}</p>
          </div>
        ) : metrics.map((item) => (
          <div key={item.id} className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex flex-col justify-between gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="reliability-copy min-w-0">
                <strong className="text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{item.label}</strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-normal break-words">{categoryLabel(item.category)}</span>
              </div>
              <strong className="text-sm text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">{item.valueLabel}</strong>
            </div>
            {item.percentage !== null ? (
              <div className="score-track bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-green-500 h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.percentage))}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function categoryLabel(category: string) {
  switch (category) {
    case "subway":
      return "Subway on-time performance";
    case "surface":
      return "Surface service on-time performance";
    case "accessibility":
      return "Elevator/escalator availability";
    default:
      return "TTC performance metric";
  }
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
