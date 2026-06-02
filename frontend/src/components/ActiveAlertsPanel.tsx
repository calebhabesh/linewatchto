"use client";


import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Bus, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { LineBadge, ImpactRouteHeader, MetadataGrid } from "./ImpactCardFields";

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
  const { activeAlerts } = useDashboardData();

  const handleAlertClick = (alertId: string) => {
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3 whitespace-nowrap">
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
              }`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <LineBadge lineId={alert.lineId} lineNumber={alert.lineNumber} />
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words mt-0.5">
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
              
              <ImpactRouteHeader location={alert.location} />
              
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {alert.description}
              </p>
              
              <MetadataGrid 
                cause={alert.cause}
                resolution={alert.resolution}
                reason={alert.reason} 
                targetRemoval={alert.targetRemoval} 
                source={alert.source} 
                startedAt={alert.startedAt}
                updatedAt={alert.updatedAt}
                updatedAgo={alert.updatedAgo} 
              />
              
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
                    Clear Highlight
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    Highlight on Map
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
