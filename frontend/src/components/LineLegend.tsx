"use client";

import React, { type CSSProperties } from "react";
import { Check, Info } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { MapBadgeVectorLabel } from "./MapOverlapIndicator";
import { transitLineBadgeColors } from "./TransitLineBadge";

function LegendImpactCountBadge({ count, isRegional = false }: { count: number; isRegional?: boolean }) {
  const isMultiple = count >= 10;
  const viewBoxWidth = isMultiple ? 46 : 36;
  const viewBoxHeight = 36;
  const halfWidth = viewBoxWidth / 2;
  const halfHeight = viewBoxHeight / 2;

  return (
    <span
      className={`legend-impact-count ${isRegional ? "legend-impact-count--regional" : ""}`}
      data-digit-count={isMultiple ? "multiple" : "single"}
      aria-hidden="true"
    >
      <svg
        viewBox={`-${halfWidth} -${halfHeight} ${viewBoxWidth} ${viewBoxHeight}`}
        className="legend-impact-count-svg"
        aria-hidden="true"
        focusable="false"
      >
        <MapBadgeVectorLabel
          label={String(count)}
          targetHeight={17.5}
          maxWidth={viewBoxWidth - 14}
        />
      </svg>
    </span>
  );
}

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
  { id: "up-express", number: "UP", name: "UP Express" },
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
  onLineClick,
}: { 
  mode?: "ttc" | "regional";
  onAlertClick?: (lineId: string) => void;
  onDelayClick?: (lineId: string) => void;
  onClosureClick?: (lineId: string) => void;
  onReducedSpeedZoneClick?: (lineId: string) => void;
  onLineClick: (lineId: string) => void;
}) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  const isRegional = mode === "regional";

  const renderLineItem = (line: { id: string; number: string; name: string }) => {
    const dataLineId = isRegional
      ? line.id === "up-express"
        ? "regional-up"
        : `regional-${line.id.replace("go-", "")}`
      : line.id;
    const alertCount = activeAlerts.filter((a) => a.lineId === dataLineId).length;
    const delayCount = delays.filter((a) => a.lineId === dataLineId).length;
    const rszCount = isRegional ? 0 : countReducedSpeedZones(reducedSpeedZones.filter((a) => a.lineId === dataLineId));
    const closureCount = plannedClosures.filter((c) => c.lineId === dataLineId).length;

    const totalImpactCount = alertCount + delayCount + rszCount + closureCount;
    const tone = totalImpactCount > 0 ? "affected" : "good";

    const buttons: React.ReactNode[] = [];

    if (alertCount > 0) {
      buttons.push(
        <button
          key="alert"
          onClick={(e) => {
            e.stopPropagation();
            onAlertClick?.(dataLineId);
          }}
          className={`pointer-events-auto cursor-pointer text-red-500 bg-white/95 dark:bg-[#12151c] rounded-full shadow-lg border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 hover:scale-110 transition-all flex items-center justify-center relative ${
            isRegional ? "w-7 h-7 shrink-0" : "p-2"
          }`}
          title={`View Alert for ${line.name}`}
          aria-label={`View Alert for ${line.name}`}
        >
          <ImpactTypeIcon kind="suspension" size={isRegional ? 17 : 20} />
          {alertCount > 1 && <LegendImpactCountBadge count={alertCount} isRegional={isRegional} />}
        </button>
      );
    }

    if (delayCount > 0) {
      buttons.push(
        <button
          key="delay"
          onClick={(e) => {
            e.stopPropagation();
            onDelayClick?.(dataLineId);
          }}
          className={`legend-delay-button pointer-events-auto cursor-pointer bg-white/95 dark:bg-[#12151c] rounded-full shadow-lg border hover:scale-110 transition-all flex items-center justify-center relative ${
            isRegional ? "w-7 h-7 shrink-0" : "p-2"
          }`}
          title={`View delay for ${line.name}`}
          aria-label={`View delay for ${line.name}`}
        >
          <ImpactTypeIcon kind="delay" size={isRegional ? 17 : 20} />
          {delayCount > 1 && <LegendImpactCountBadge count={delayCount} isRegional={isRegional} />}
        </button>
      );
    }

    if (rszCount > 0) {
      buttons.push(
        <button
          key="rsz"
          onClick={(e) => {
            e.stopPropagation();
            onReducedSpeedZoneClick?.(dataLineId);
          }}
          className={`legend-rsz-button pointer-events-auto cursor-pointer bg-white/95 dark:bg-[#12151c] rounded-full shadow-lg border hover:scale-110 transition-all flex items-center justify-center relative ${
            isRegional ? "w-7 h-7 shrink-0" : "p-2"
          }`}
          title={`View reduced speed zone for ${line.name}`}
          aria-label={`View reduced speed zone for ${line.name}`}
        >
          <ImpactTypeIcon kind="reduced-speed-zone" size={isRegional ? 17 : 20} />
          {rszCount > 1 && <LegendImpactCountBadge count={rszCount} isRegional={isRegional} />}
        </button>
      );
    }

    if (closureCount > 0) {
      buttons.push(
        <button
          key="closure"
          onClick={(e) => {
            e.stopPropagation();
            onClosureClick?.(dataLineId);
          }}
          className={`pointer-events-auto cursor-pointer text-blue-500 bg-white/95 dark:bg-[#12151c] rounded-full shadow-lg border border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:scale-110 transition-all flex items-center justify-center relative ${
            isRegional ? "w-7 h-7 shrink-0" : "p-2"
          }`}
          title={`View Closure for ${line.name}`}
          aria-label={`View Closure for ${line.name}`}
        >
          <ImpactTypeIcon kind="planned-closure" size={isRegional ? 17 : 20} />
          {closureCount > 1 && <LegendImpactCountBadge count={closureCount} isRegional={isRegional} />}
        </button>
      );
    }

    const renderIconsContainer = () => {
      if (!isRegional) {
        return (
          <div className="w-28 h-[44px] flex items-center gap-2 shrink-0 justify-end">
            {buttons}
          </div>
        );
      }

      const count = buttons.length;
      if (count === 0) {
        return <div className="w-[58px] h-[58px] shrink-0" aria-hidden="true" />;
      }

      if (count === 1) {
        return (
          <div className="w-[58px] h-[58px] flex items-center justify-end shrink-0">
            {buttons[0]}
          </div>
        );
      }

      if (count === 2) {
        return (
          <div className="w-[58px] h-[58px] flex flex-col justify-center items-end gap-0.5 shrink-0">
            {buttons[0]}
            {buttons[1]}
          </div>
        );
      }

      if (count === 3) {
        return (
          <div className="w-[58px] h-[58px] grid grid-cols-2 gap-0.5 items-center justify-items-center shrink-0">
            <div className="col-span-2 flex justify-center">
              {buttons[0]}
            </div>
            <div>{buttons[1]}</div>
            <div>{buttons[2]}</div>
          </div>
        );
      }

      return (
        <div className="w-[58px] h-[58px] grid grid-cols-2 gap-0.5 items-center justify-items-center shrink-0">
          <div>{buttons[0]}</div>
          <div>{buttons[1]}</div>
          <div>{buttons[2]}</div>
          <div>{buttons[3]}</div>
        </div>
      );
    };

    const ttcBadgeColors = transitLineBadgeColors(line.id);
    const ttcBadgeStyle = {
      "--desktop-legend-badge-fill-color": ttcBadgeColors.backgroundColor,
      "--desktop-legend-badge-number-color": ttcBadgeColors.color,
    } as CSSProperties;

    return (
      <div
        key={line.id}
        className={`flex items-center ${
          isRegional ? "gap-2.5 min-w-0" : "gap-3.5"
        }`}
      >
        {renderIconsContainer()}

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

        {isRegional ? (
          <span
            className={`desktop-legend-route-badge desktop-legend-route-badge--regional service-tone-${tone} shrink-0`}
            aria-hidden="true"
          >
            <span
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[4px] text-[22px] font-extrabold leading-none text-white opacity-95"
              style={{ backgroundColor: LINE_COLORS[line.id] ?? "#64748b" }}
              aria-hidden="true"
            >
              {line.number}
            </span>
          </span>
        ) : (
          <span
            className={`desktop-legend-route-badge desktop-legend-route-badge--ttc service-tone-${tone} opacity-95 shrink-0`}
            style={ttcBadgeStyle}
            aria-hidden="true"
          >
            <span className="desktop-legend-route-number">{line.number}</span>
          </span>
        )}
        <button
          type="button"
          className={`desktop-legend-line-button service-tone-${tone}`}
          onClick={(event) => {
            event.stopPropagation();
            onLineClick(dataLineId);
          }}
          aria-label={`View all service impacts for ${line.name}: ${totalImpactCount > 0 ? `${totalImpactCount} service impacts` : "regular service"}`}
        >
          <span
            className={`legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap leading-none ${
              isRegional ? "text-[24px]" : "text-[22px]"
            }`}
          >
            {line.name}
          </span>
          <span className="desktop-legend-status-chip" aria-hidden="true">
            {totalImpactCount > 0 ? (
              <>
                <Info size={15} strokeWidth={2.5} />
                <span>{totalImpactCount}</span>
              </>
            ) : (
              <Check size={15} strokeWidth={3} />
            )}
          </span>
        </button>
      </div>
    );
  };

  const REGULAR_SERVICE_GREY = "#94a3b8";
  const LIMITED_SERVICE_GREY = "#8292a7";

  const renderLimitedServiceItem = () => (
    <div key="limited-service" className="flex items-center gap-2.5 min-w-0">
      <div className="w-[58px] h-[58px] shrink-0" aria-hidden="true" />
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
      <span className="legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap text-[24px] leading-none">
        Limited Service
      </span>
    </div>
  );

  const renderRegularServiceItem = () => (
    <div key="regular-service" className="flex items-center gap-2.5 min-w-0">
      <div className="w-[58px] h-[58px] shrink-0" aria-hidden="true" />
      <div
        className="legend-line-segment relative shrink-0 flex items-center justify-center rounded-none overflow-hidden"
        style={{
          backgroundColor: REGULAR_SERVICE_GREY,
          width: "80px",
          height: "18px",
        }}
        aria-hidden="true"
      />
      <span className="legend-line-name font-subway text-black dark:text-white drop-shadow-md font-bold tracking-normal whitespace-nowrap text-[24px] leading-none">
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
          ? "grid grid-cols-[max-content_max-content] gap-x-4 gap-y-4"
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
