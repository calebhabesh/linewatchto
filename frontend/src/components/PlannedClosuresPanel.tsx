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
    <section className="panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Calendar size={18} className="text-blue-500" />
          Planned Closures
        </h2>
        <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-bold">
          {plannedClosures.length} Upcoming
        </span>
      </div>
      <div className="closure-stack p-3 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        {plannedClosures.map((closure) => {
          const isActive = selectedClosureId === closure.id;
          return (
            <div
              key={closure.id}
              className={`closure-card p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 transition-all ${
                isActive ? "border-blue-500/50 bg-blue-500/5 dark:bg-blue-500/5" : ""
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-2">
                  <span
                    className={`line-badge small`}
                    style={{
                      backgroundColor: closure.lineId === "line-1" ? "#f4c430" : closure.lineId === "line-2" ? "#14a44d" : closure.lineId === "line-4" ? "#b84ed8" : "#f57c00",
                      color: closure.lineId === "line-1" ? "#000000" : "#ffffff",
                    }}
                  >
                    {closure.lineNumber}
                  </span>
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {closure.title}
                  </strong>
                </div>
                {closure.shuttle && (
                  <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                    <Bus size={10} />
                    Shuttle
                  </span>
                )}
              </div>
              
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1 bg-blue-500/5 dark:bg-blue-500/10 px-2 py-0.5 rounded-md inline-block">
                {closure.window}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium">
                {closure.location}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {closure.description}
              </p>

              <button
                onClick={() => handleClosureClick(closure.id)}
                className={`preview-button mt-3 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border ${
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
