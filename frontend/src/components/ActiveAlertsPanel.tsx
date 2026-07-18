"use client";


import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Bus, ChevronLeft, X } from "lucide-react";
import type { ActiveAlert, ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
  onFocusMap?: () => void;
}

function impactKindForAlert(alert: ActiveAlert): ImpactKind {
  switch (alert.severity) {
    case "planned":
      return "planned-closure";
    case "delay":
      return "delay";
    default:
      return "suspension";
  }
}

export function ActiveAlertsPanel({
  selection,
  onSelectImpact,
  onBack,
  onClose,
  onFocusMap,
}: Props) {
  const { activeAlerts, reducedSpeedZones, delays, plannedClosures, networkSegments, stationNodeImpacts } = useDashboardData();
  useScrollSelectedImpactCard(selection, "suspension");

  const handleAlertClick = (alert: ActiveAlert) => {
    const alertImpactKind = impactKindForAlert(alert);
    const isPlanned = alert.severity === "planned";
    const isActive = selection?.id === alert.id && (
      selection?.kind === alertImpactKind ||
      (selection?.kind === "planned-closure" && isPlanned)
    );
    const isActivating = !isActive;
    const kind = isPlanned ? "planned-closure" : alertImpactKind;
    
    onSelectImpact(
      isActivating ? { kind, id: alert.id } : null
    );
    
    if (isActivating && onFocusMap) {
      onFocusMap();
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "suspension":
        return "suspension-card-border";
      case "planned":
        return "suspension-card-border";
      case "delay":
        return "delay-card-border";
      default:
        return "border-l-slate-500";
    }
  };

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Back"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <AlertTriangle className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-red-500 shrink-0" />
            <span>Active Alerts</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1 mt-0.5 min-w-0">
            <span className="shrink-0 text-[9px] sm:text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
              {activeAlerts.length} {activeAlerts.length === 1 ? "Alert" : "Alerts"}
            </span>
            <CardSource source={activeAlerts[0]?.source || "TTC Live Alerts"} />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
            </button>
          )}
        </div>
      </div>
      <div className={`alert-stack min-w-0 p-3 flex flex-col gap-2 ${activeAlerts.length === 0 ? "is-empty" : ""}`}>
        {activeAlerts.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
            No Active Alerts
          </div>
        ) : (
          activeAlerts.map((alert) => {
            const alertImpactKind = impactKindForAlert(alert);
            const isPlanned = alert.severity === "planned";
            const isActive = selection?.id === alert.id && (
              selection?.kind === alertImpactKind ||
              (selection?.kind === "planned-closure" && isPlanned)
            );
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: alertImpactKind, id: alert.id, segmentIds: alert.affectedSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );

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
                    <div className="flex flex-col items-end shrink-0 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                        <Bus size={10} />
                        Shuttle
                      </span>
                    </div>
                  )}
                </div>
                
                <ImpactRouteHeader location={alert.location} direction={alert.displayDirection} />
                
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                  {alert.description}
                </p>

                <OverlappingImpactRefs
                  overlaps={overlappingImpacts}
                  onSelectImpact={onSelectImpact}
                  label="Overlapping:"
                />
                
                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                  <div className="flex-1 min-w-0">
                    <MetadataGrid 
                      className="no-border"
                      cause={alert.cause}
                      resolution={alert.resolution}
                      reason={alert.reason} 
                      targetRemoval={alert.targetRemoval} 
                      startedAt={alert.startedAt}
                      updatedAt={alert.updatedAt}
                      updatedAgo={alert.updatedAgo} 
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlertClick(alert)}
                    className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? "bg-slate-600 text-white border-slate-700 hover:bg-slate-700 dark:bg-slate-500 dark:border-slate-600 dark:hover:bg-slate-400 shadow-[0_0_12px_rgba(100,116,139,0.3)]"
                        : "bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700"
                    }`}
                  >
                    <JumpToLocationIcon className="w-8 h-8" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight mt-1.5 max-w-[72px] whitespace-normal break-words">
                      {isActive ? "Unfocus" : "Show on Map"}
                    </span>
                  </button>
                </div>
                

              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
