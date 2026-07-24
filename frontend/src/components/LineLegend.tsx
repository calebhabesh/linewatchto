"use client";

import { useDashboardData } from "../app/DataContext";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { TransitLineBadge } from "./TransitLineBadge";

const TTC_LINES = [
  { id: "line-1", number: "1", name: "Line 1 Yonge-University" },
  { id: "line-2", number: "2", name: "Line 2 Bloor-Danforth" },
  { id: "line-4", number: "4", name: "Line 4 Sheppard" },
  { id: "line-5", number: "5", name: "Line 5 Eglinton" },
  { id: "line-6", number: "6", name: "Line 6 Finch West" },
];

const REGIONAL_LINES = [
  { id: "go-br", number: "BR", name: "Barrie Line" },
  { id: "go-ki", number: "KI", name: "Kitchener Line" },
  { id: "go-le", number: "LE", name: "Lakeshore East Line" },
  { id: "go-lw", number: "LW", name: "Lakeshore West Line" },
  { id: "go-mi", number: "MI", name: "Milton Line" },
  { id: "go-rh", number: "RH", name: "Richmond Hill Line" },
  { id: "go-st", number: "ST", name: "Stouffville Line" },
  { id: "up-express", number: "UP", name: "Union Pearson Express" },
];

export function LineLegend({ 
  mode = "ttc",
  onAlertClick, 
  onDelayClick,
  onClosureClick,
  onReducedSpeedZoneClick,
}: { 
  mode?: "ttc" | "regional";
  onAlertClick?: (lineId: string) => void;
  onDelayClick?: (lineId: string) => void;
  onClosureClick?: (lineId: string) => void;
  onReducedSpeedZoneClick?: (lineId: string) => void;
}) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  const isRegional = mode === "regional";
  const lines = isRegional ? REGIONAL_LINES : TTC_LINES;

  return (
    <div
      className={`select-none pointer-events-none ${
        isRegional
          ? "grid grid-cols-2 gap-x-6 gap-y-4"
          : "flex flex-col gap-4"
      }`}
    >
      {lines.map((line) => {
        const alert = activeAlerts.find((a) => a.lineId === line.id);
        const delay = delays.find((a) => a.lineId === line.id);
        const rsz = reducedSpeedZones.find((a) => a.lineId === line.id);
        const closure = plannedClosures.find((c) => c.lineId === line.id);
        const hasImpact = !!(alert || delay || rsz || closure);

        return (
          <div
            key={line.id}
            className={`flex items-center gap-3.5 ${
              isRegional ? "min-w-0" : ""
            }`}
          >
            <div
              className={`flex items-center gap-2 shrink-0 justify-end ${
                isRegional
                  ? hasImpact ? "h-[52px]" : "hidden"
                  : "w-28 h-[44px]"
              }`}
            >
              {alert && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlertClick?.(line.id);
                  }}
                  className="pointer-events-auto cursor-pointer text-red-500 bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 hover:scale-110 transition-all"
                  title={`View Alert for ${line.name}`}
                  aria-label={`View Alert for ${line.name}`}
                >
                  <ImpactTypeIcon kind="suspension" size={20} />
                </button>
              )}
              {delay && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelayClick?.(line.id);
                  }}
                  className="legend-delay-button pointer-events-auto cursor-pointer bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border hover:scale-110 transition-all"
                  title={`View delay for ${line.name}`}
                  aria-label={`View delay for ${line.name}`}
                >
                  <ImpactTypeIcon kind="delay" size={20} />
                </button>
              )}
              {rsz && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReducedSpeedZoneClick?.(line.id);
                  }}
                  className="legend-rsz-button pointer-events-auto cursor-pointer bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border hover:scale-110 transition-all"
                  title={`View reduced speed zone for ${line.name}`}
                  aria-label={`View reduced speed zone for ${line.name}`}
                >
                  <ImpactTypeIcon kind="reduced-speed-zone" size={20} />
                </button>
              )}
              {closure && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClosureClick?.(line.id);
                  }}
                  className="pointer-events-auto cursor-pointer text-blue-500 bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:scale-110 transition-all"
                  title={`View Closure for ${line.name}`}
                  aria-label={`View Closure for ${line.name}`}
                >
                  <ImpactTypeIcon kind="planned-closure" size={20} />
                </button>
              )}
            </div>
            <TransitLineBadge
              lineId={line.id}
              lineNumber={line.number}
              size={isRegional ? 52 : 44}
              className="opacity-95 shrink-0"
            />
            <span
              className={`legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap ${
                isRegional ? "text-[24px]" : "text-[22px]"
              }`}
            >
              {line.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
