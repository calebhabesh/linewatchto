"use client";

import { activeAlerts } from "../app/linewatch-data";
import { AlertTriangle, Bus } from "lucide-react";

export function ActiveAlertsPanel({
  selectedAlertId,
  onSelectAlertId,
}: {
  selectedAlertId: string | null;
  onSelectAlertId: (id: string | null) => void;
}) {
  const handleAlertClick = (alertId: string) => {
    if (selectedAlertId === alertId) {
      onSelectAlertId(null);
    } else {
      onSelectAlertId(alertId);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "suspension":
        return "border-l-red-600";
      case "delay":
        return "border-l-amber-500";
      default:
        return "border-l-slate-500";
    }
  };

  return (
    <section className="panel min-w-0 bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex min-w-0 items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          Active Alerts
        </h2>
        <span className="shrink-0 text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">
          {activeAlerts.length} Active
        </span>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        {activeAlerts.map((alert) => {
          const isActive = selectedAlertId === alert.id;
          return (
            <button
              key={alert.id}
              onClick={() => handleAlertClick(alert.id)}
              className={`alert-card min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 ${getSeverityColor(
                alert.severity
              )} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all ${
                isActive ? "ring-2 ring-blue-500 dark:ring-blue-400 bg-black/10 dark:bg-white/10" : ""
              }`}
              aria-label={`Alert: ${alert.title} on Line ${alert.lineNumber} at ${alert.location}`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="line-badge small shrink-0"
                    style={{
                      backgroundColor: alert.lineId === "line-1" ? "#f4c430" : alert.lineId === "line-2" ? "#14a44d" : alert.lineId === "line-4" ? "#b84ed8" : "#f57c00",
                      color: alert.lineId === "line-1" ? "#000000" : "#ffffff",
                    }}
                  >
                    {alert.lineNumber}
                  </span>
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                    {alert.title}
                  </strong>
                </div>
                {alert.shuttle && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                    <Bus size={10} />
                    Shuttle
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium whitespace-normal break-words">
                {alert.location}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {alert.description}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-black/5 dark:border-white/5">
                <span className="whitespace-normal break-words">{alert.source}</span>
                <span className="whitespace-normal break-words">{alert.updatedAgo}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
