"use client";

import React from "react";
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

const LINE_COLORS: Record<string, string> = {
  "line-1": "#F8C300",
  "line-2": "#00923F",
  "line-4": "#A21A68",
  "line-5": "#EB8738",
  "line-6": "#969594",
  "go-br": "#155BA0",
  "go-ki": "#138336",
  "go-le": "#EE2722",
  "go-lw": "#8B0A31",
  "go-mi": "#F47216",
  "go-rh": "#27ADEA",
  "go-st": "#774111",
  "up-express": "#4084CD",
};

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

  const renderLineItem = (line: { id: string; number: string; name: string }) => {
    const alert = activeAlerts.find((a) => a.lineId === line.id);
    const delay = delays.find((a) => a.lineId === line.id);
    const rsz = reducedSpeedZones.find((a) => a.lineId === line.id);
    const closure = plannedClosures.find((c) => c.lineId === line.id);
    const hasImpact = !!(alert || delay || rsz || closure);

    return (
      <div
        key={line.id}
        className={`flex items-center ${
          isRegional ? "gap-2.5 min-w-0" : "gap-3.5"
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

        {isRegional && (
          <div
            className="legend-line-segment relative shrink-0 flex items-center justify-center rounded-none overflow-hidden"
            style={{
              backgroundColor: LINE_COLORS[line.id] ?? "#64748b",
              width: "18px",
              height: "44px",
            }}
            aria-hidden="true"
          >
            {line.id === "up-express" && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-0"
                viewBox="0 0 18 44"
                fill="none"
              >
                <line
                  x1="9"
                  y1="0"
                  x2="9"
                  y2="44"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeDasharray="10 4"
                />
              </svg>
            )}
            <span
              className="rounded-full bg-white shrink-0 relative z-10"
              style={{
                width: "14px",
                height: "14px",
                border: "2px solid #000000",
              }}
            />
          </div>
        )}

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
  };

  const REGULAR_SERVICE_GREY = "#94a3b8";
  const LIMITED_SERVICE_GREY = "#8292a7";

  const renderLimitedServiceItem = () => (
    <div key="limited-service" className="flex items-center gap-2.5 min-w-0">
      <div
        className="legend-line-segment relative shrink-0 flex items-center justify-center rounded-none overflow-hidden"
        style={{
          backgroundColor: LIMITED_SERVICE_GREY,
          width: "80px",
          height: "18px",
        }}
        aria-hidden="true"
      >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 80 18"
          fill="none"
        >
          <line
            x1="0"
            y1="9"
            x2="80"
            y2="9"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeDasharray="10 4"
          />
        </svg>
      </div>
      <span className="legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap text-[24px]">
        Limited Service
      </span>
    </div>
  );

  const renderRegularServiceItem = () => (
    <div key="regular-service" className="flex items-center gap-2.5 min-w-0">
      <div
        className="legend-line-segment relative shrink-0 flex items-center justify-center rounded-none overflow-hidden"
        style={{
          backgroundColor: REGULAR_SERVICE_GREY,
          width: "80px",
          height: "18px",
        }}
        aria-hidden="true"
      />
      <span className="legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap text-[24px]">
        Regular Service
      </span>
    </div>
  );

  const regionalRows = [
    [REGIONAL_LINES[0], REGIONAL_LINES[1]],
    [REGIONAL_LINES[2], REGIONAL_LINES[3]],
    [REGIONAL_LINES[4], REGIONAL_LINES[5]],
    [REGIONAL_LINES[6], REGIONAL_LINES[7]],
  ];

  return (
    <div
      className={`select-none pointer-events-none ${
        isRegional
          ? "grid grid-cols-2 gap-x-6 gap-y-4"
          : "flex flex-col gap-4"
      }`}
    >
      {isRegional ? (
        <>
          {regionalRows.map(([leftLine, rightLine], idx) => (
            <React.Fragment key={idx}>
              {renderLineItem(leftLine)}
              {renderLineItem(rightLine)}
            </React.Fragment>
          ))}
          {renderLimitedServiceItem()}
          {renderRegularServiceItem()}
        </>
      ) : (
        TTC_LINES.map((line) => renderLineItem(line))
      )}
    </div>
  );
}

