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
        return "border-red-600";
      case "delay":
        return "border-amber-500";
      default:
        return "border-slate-500";
    }
  };

  return (
    <section className="panel bg-[#12151c]/90 border border-black/10 dark:border-white/10 rounded-lg shadow-lg">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          Active Alerts
        </h2>
        <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">
          {activeAlerts.length} Active
        </span>
      </div>
      <div className="alert-stack p-3 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        {activeAlerts.map((alert) => {
          const isActive = selectedAlertId === alert.id;
          return (
            <button
              key={alert.id}
              onClick={() => handleAlertClick(alert.id)}
              className={`alert-card text-left p-3 rounded-lg border-l-4 ${getSeverityColor(
                alert.severity
              )} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all ${
                isActive ? "ring-2 ring-blue-500 dark:ring-blue-400 bg-black/10 dark:bg-white/10" : ""
              }`}
              aria-label={`Alert: ${alert.title} on Line ${alert.lineNumber} at ${alert.location}`}
            >
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-2">
                  <span
                    className={`line-badge small`}
                    style={{
                      backgroundColor: alert.lineId === "line-1" ? "#f4c430" : alert.lineId === "line-2" ? "#14a44d" : alert.lineId === "line-4" ? "#b84ed8" : "#f57c00",
                      color: alert.lineId === "line-1" ? "#000000" : "#ffffff",
                    }}
                  >
                    {alert.lineNumber}
                  </span>
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {alert.title}
                  </strong>
                </div>
                {alert.shuttle && (
                  <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                    <Bus size={10} />
                    Shuttle
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                {alert.location}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                {alert.description}
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-black/5 dark:border-white/5">
                <span>{alert.source}</span>
                <span>{alert.updatedAgo}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
