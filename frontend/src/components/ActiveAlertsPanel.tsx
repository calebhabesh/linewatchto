"use client";


import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Bus, ChevronLeft, Eye, EyeOff } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource } from "./ImpactCardFields";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
}

export function ActiveAlertsPanel({
  selection,
  onSelectImpact,
  onBack,
}: Props) {
  const { activeAlerts } = useDashboardData();
  useScrollSelectedImpactCard(selection, "suspension");

  const handleAlertClick = (alertId: string) => {
    onSelectImpact(
      selection?.kind === "suspension" && selection.id === alertId
        ? null
        : { kind: "suspension", id: alertId },
    );
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
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1">
          {onBack && (
            <button onClick={onBack} className="p-1 sm:p-2 -ml-1 sm:-ml-3 mr-0 sm:mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0">
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <AlertTriangle className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-red-500 shrink-0" />
            <span>Active Alerts</span>
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1 mt-0.5 shrink-0">
          <span className="shrink-0 text-[9px] sm:text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
            {activeAlerts.length} {activeAlerts.length === 1 ? "Alert" : "Alerts"}
          </span>
          <CardSource source={activeAlerts[0]?.source || "TTC Live Alerts"} />
        </div>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {activeAlerts.map((alert) => {
          const isActive = selection?.kind === "suspension" && selection.id === alert.id;
          return (
            <div
              key={alert.id}
              data-impact-card-id={alert.id}
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
                  <div className="flex flex-col items-end shrink-0">
                    <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                      <Bus size={10} />
                      Shuttle
                    </span>
                  </div>
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
