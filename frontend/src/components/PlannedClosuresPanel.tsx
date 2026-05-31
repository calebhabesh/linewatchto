"use client";

import { plannedClosures } from "../app/linewatch-data";
import { Calendar, Eye, EyeOff, Bus } from "lucide-react";

export function PlannedClosuresPanel({
  selectedClosureId,
  onSelectClosureId,
}: {
  selectedClosureId: string | null;
  onSelectClosureId: (id: string | null) => void;
}) {
  const handleClosureClick = (closureId: string) => {
    if (selectedClosureId === closureId) {
      onSelectClosureId(null);
    } else {
      onSelectClosureId(closureId);
    }
  };

  return (
    <section className="panel min-w-0 bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex min-w-0 items-center gap-2">
          <Calendar size={18} className="text-blue-500" />
          Planned Closures
        </h2>
        <span className="shrink-0 text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-bold">
          {plannedClosures.length} Upcoming
        </span>
      </div>
      <div className="closure-stack min-w-0 p-3 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        {plannedClosures.map((closure) => {
          const isActive = selectedClosureId === closure.id;
          return (
            <div
              key={closure.id}
              className={`closure-card min-w-0 p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 transition-all ${
                isActive ? "border-blue-500/50 bg-blue-500/5 dark:bg-blue-500/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="line-badge small shrink-0"
                    style={{
                      backgroundColor: closure.lineId === "line-1" ? "#f4c430" : closure.lineId === "line-2" ? "#14a44d" : closure.lineId === "line-4" ? "#b84ed8" : "#f57c00",
                      color: closure.lineId === "line-1" ? "#000000" : "#ffffff",
                    }}
                  >
                    {closure.lineNumber}
                  </span>
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                    {closure.title}
                  </strong>
                </div>
                {closure.shuttle && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                    <Bus size={10} />
                    Shuttle
                  </span>
                )}
              </div>
              
              <div className="max-w-full text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1 bg-blue-500/5 dark:bg-blue-500/10 px-2 py-0.5 rounded-md inline-block whitespace-normal break-words">
                {closure.window}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium whitespace-normal break-words">
                {closure.location}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed whitespace-normal break-words">
                {closure.description}
              </p>

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
                    Hide Map Preview
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    Preview on Map
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
