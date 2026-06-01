"use client";

import { useState, useRef, useEffect } from "react";
import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Bus, ChevronLeft, Eye, EyeOff } from "lucide-react";

interface Props {
  selectedAlertId?: string | null;
  onSelectAlertId?: (id: string | null) => void;
  onBack?: () => void;
}

export function ActiveAlertsPanel({
  selectedAlertId,
  onSelectAlertId,
  onBack,
}: Props) {
  const internalClickRef = useRef(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const { activeAlerts } = useDashboardData();

  useEffect(() => {
    if (internalClickRef.current) {
      internalClickRef.current = false;
      setFlashId(null);
    } else {
      setFlashId(selectedAlertId || null);
    }
  }, [selectedAlertId]);

  const handleAlertClick = (alertId: string) => {
    internalClickRef.current = true;
    if (onSelectAlertId) {
      if (selectedAlertId === alertId) {
        onSelectAlertId(null);
      } else {
        onSelectAlertId(alertId);
      }
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
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 whitespace-nowrap">
            <AlertTriangle size={22} className="text-red-500 shrink-0" />
            Active Alerts
          </h2>
        </div>
        <span className="shrink-0 text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">
          {activeAlerts.length} Active
        </span>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {activeAlerts.map((alert) => {
          const isActive = selectedAlertId === alert.id;
          return (
            <div
              key={alert.id}
              className={`alert-card min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 ${getSeverityColor(
                alert.severity
              )} !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
              } ${flashId === alert.id ? "highlight-active-card" : ""}`}
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
              
              <button
                onClick={() => handleAlertClick(alert.id)}
                className={`preview-button mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border whitespace-normal ${
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
