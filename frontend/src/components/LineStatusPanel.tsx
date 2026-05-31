"use client";

import { lineStatuses } from "../app/linewatch-data";
import { Activity } from "lucide-react";

export function LineStatusPanel() {
  const getStatusPill = (status: string, label: string) => {
    let classes = "status-pill neutral";
    if (status === "suspension") {
      classes = "status-pill danger";
    } else if (status === "delay") {
      classes = "status-pill warning";
    } else if (status === "normal") {
      classes = "status-pill ok";
    }

    return (
      <span className={`status-pill ${classes}`}>
        {label}
      </span>
    );
  };

  return (
    <section className="panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity size={18} className="text-blue-500 animate-pulse" />
          Subway & LRT Lines
        </h2>
      </div>
      <div className="line-list p-3 flex flex-col gap-3">
        {lineStatuses.map((line) => (
          <div key={line.id} className="line-row flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="line-badge"
                style={{
                  backgroundColor: line.color,
                  color: line.id === "line-1" ? "#000000" : "#ffffff",
                }}
              >
                {line.number}
              </span>
              <div>
                <strong className="text-sm font-bold text-slate-800 dark:text-white">
                  {line.name}
                </strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {line.route}
                </p>
              </div>
            </div>
            {getStatusPill(line.status, line.statusLabel)}
          </div>
        ))}
      </div>
    </section>
  );
}
