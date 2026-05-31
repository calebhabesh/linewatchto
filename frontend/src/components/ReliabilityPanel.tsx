"use client";

import { reliabilitySummaries, ingestionHealth } from "../app/linewatch-data";
import { BarChart3, ShieldCheck } from "lucide-react";

export function ReliabilityPanel() {
  return (
    <section className="analytics-panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 size={18} className="text-purple-500" />
          Reliability Analytics (7-Day)
        </h2>
      </div>
      <div className="reliability-list p-3 flex flex-col gap-2">
        {reliabilitySummaries.map((item) => (
          <div
            key={item.lineId}
            className="reliability-row p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="line-badge"
                style={{
                  backgroundColor: item.lineId === "line-1" ? "#f4c430" : item.lineId === "line-2" ? "#14a44d" : item.lineId === "line-4" ? "#b84ed8" : item.lineId === "line-5" ? "#f57c00" : "#969594",
                  color: item.lineId === "line-1" ? "#000000" : "#ffffff",
                }}
              >
                {item.lineNumber}
              </span>
              <div className="reliability-copy">
                <strong className="text-sm font-bold text-slate-800 dark:text-white">
                  {item.label}
                </strong>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {item.incidents7d} incidents • {item.medianDuration} median delay
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="score-track flex-1 sm:w-28 bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
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
  return (
    <section className="health-panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-500" />
          Ingestion System Health
        </h2>
      </div>
      <div className="health-grid p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ingestionHealth.map((health, idx) => (
          <div
            key={idx}
            className="health-item p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex gap-3 items-start"
          >
            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mt-1.5" />
            <div>
              <strong className="text-xs font-bold text-slate-800 dark:text-white">
                {health.label}
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {health.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
