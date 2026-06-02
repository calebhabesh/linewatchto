"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, ChevronLeft, Eye, EyeOff } from "lucide-react";

interface Props {
  selectedAlertId?: string | null;
  onSelectAlertId?: (id: string | null) => void;
  onBack?: () => void;
}

export function ReducedSpeedZonesPanel({
  selectedAlertId,
  onSelectAlertId,
  onBack,
}: Props) {
  const internalClickRef = useRef(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const { reducedSpeedZones } = useDashboardData();

  useEffect(() => {
    if (internalClickRef.current) {
      internalClickRef.current = false;
      setFlashId(null);
    } else {
      setFlashId(selectedAlertId || null);
    }
  }, [selectedAlertId]);

  const handleReducedSpeedZoneClick = (alertId: string) => {
    internalClickRef.current = true;
    onSelectAlertId?.(selectedAlertId === alertId ? null : alertId);
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
            <AlertTriangle size={22} className="text-amber-500 shrink-0" />
            Reduced Speed Zones
          </h2>
        </div>
        <span className="shrink-0 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
          {reducedSpeedZones.length} Degraded
        </span>
      </div>
      <div className="alert-stack min-w-0 p-3 flex flex-col gap-2">
        {reducedSpeedZones.map((zone) => {
          const isActive = selectedAlertId === zone.id;
          return (
            <div
              key={zone.id}
              className={`alert-card min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 border-l-amber-500 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                isActive ? "!bg-amber-50 dark:!bg-amber-950" : ""
              } ${flashId === zone.id ? "highlight-active-card" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="line-badge small shrink-0"
                    style={{
                      backgroundColor: zone.lineId === "line-1" ? "#f4c430" : zone.lineId === "line-2" ? "#14a44d" : zone.lineId === "line-4" ? "#b84ed8" : "#f57c00",
                      color: zone.lineId === "line-1" ? "#000000" : "#ffffff",
                    }}
                  >
                    {zone.lineNumber}
                  </span>
                  <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                    {zone.title}
                  </strong>
                </div>
              </div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1 whitespace-normal break-words">
                {zone.displayDirection}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium whitespace-normal break-words">
                {zone.location}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                {zone.description}
              </p>
              {zone.directionalDetails && zone.directionalDetails.length > 1 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-black/5 pt-2 dark:border-white/5">
                  {zone.directionalDetails.map((detail) => (
                    <p key={detail.sourceAlertId} className="text-xs text-slate-600 dark:text-slate-400 whitespace-normal break-words">
                      <strong>{detail.displayDirection}:</strong> {detail.location}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-black/5 dark:border-white/5">
                <span className="whitespace-normal break-words">{zone.source}</span>
                <span className="whitespace-normal break-words">{zone.updatedAgo}</span>
              </div>

              <button
                onClick={() => handleReducedSpeedZoneClick(zone.id)}
                className={`preview-button mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all border whitespace-normal ${
                  isActive
                    ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
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
                    Preview Reduced Speed Zone
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
