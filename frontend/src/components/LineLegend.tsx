"use client";

import Image from "next/image";
import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Calendar } from "lucide-react";

const LINES = [
  { id: "line-1", name: "Line 1 Yonge-University", icon: "/assets/linewatch/line-1-legend.svg?v=2" },
  { id: "line-2", name: "Line 2 Bloor-Danforth", icon: "/assets/linewatch/line-2-legend.svg?v=2" },
  { id: "line-4", name: "Line 4 Sheppard", icon: "/assets/linewatch/line-4-legend.svg?v=2" },
  { id: "line-5", name: "Line 5 Eglinton", icon: "/assets/linewatch/line-5-legend.svg?v=2" },
  { id: "line-6", name: "Line 6 Finch West", icon: "/assets/linewatch/line-6-legend.svg?v=2" },
];

export function LineLegend({ 
  onAlertClick, 
  onClosureClick,
  onReducedSpeedZoneClick,
}: { 
  onAlertClick?: (id: string) => void;
  onClosureClick?: (id: string) => void;
  onReducedSpeedZoneClick?: (id: string) => void;
}) {
  const { activeAlerts, reducedSpeedZones, plannedClosures } = useDashboardData();
  return (
    <div className="flex flex-col gap-4 select-none pointer-events-none">
      {LINES.map(line => {
        const alert = activeAlerts.find(a => a.lineId === line.id);
        const rsz = reducedSpeedZones.find(a => a.lineId === line.id);
        const closure = plannedClosures.find(c => c.lineId === line.id);
        return (
          <div key={line.id} className="flex items-center gap-3.5">
            <div className="flex items-center gap-2 w-28 shrink-0 justify-end h-[44px]">
              {alert && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAlertClick?.(alert.id); }}
                  className="pointer-events-auto cursor-pointer text-red-500 bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 hover:scale-110 transition-all"
                  title={`View Alert for ${line.name}`}
                >
                  <AlertTriangle size={18} className="fill-red-100 dark:fill-red-950" />
                </button>
              )}
              {rsz && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReducedSpeedZoneClick?.(rsz.id); }}
                  className="pointer-events-auto cursor-pointer text-amber-500 bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:scale-110 transition-all"
                  title={`View reduced speed zone for ${line.name}`}
                >
                  <AlertTriangle size={18} className="fill-amber-100 dark:fill-amber-950" />
                </button>
              )}
              {closure && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClosureClick?.(closure.id); }}
                  className="pointer-events-auto cursor-pointer text-blue-500 bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:scale-110 transition-all"
                  title={`View Closure for ${line.name}`}
                >
                  <Calendar size={18} className="fill-blue-50 dark:fill-blue-950" />
                </button>
              )}
            </div>
            <Image 
              src={line.icon} 
              alt={`${line.name} icon`} 
              width={44} 
              height={44} 
              className="opacity-95"
            />
            <span className="text-black dark:text-white drop-shadow-md text-base font-extrabold tracking-widest">{line.name}</span>
          </div>
        );
      })}
    </div>
  );
}
