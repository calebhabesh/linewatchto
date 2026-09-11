"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ImpactKind } from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";

const TTC_LINES = [
  { id: "line-1", number: "1", name: "Yonge-University" },
  { id: "line-2", number: "2", name: "Bloor-Danforth" },
  { id: "line-4", number: "4", name: "Sheppard" },
  { id: "line-5", number: "5", name: "Eglinton" },
  { id: "line-6", number: "6", name: "Finch West" },
];

const REGIONAL_LINES = [
  { id: "go-br", number: "BR", name: "Barrie" },
  { id: "go-ki", number: "KI", name: "Kitchener" },
  { id: "go-le", number: "LE", name: "Lakeshore East" },
  { id: "go-lw", number: "LW", name: "Lakeshore West" },
  { id: "go-mi", number: "MI", name: "Milton" },
  { id: "go-rh", number: "RH", name: "Richmond Hill" },
  { id: "go-st", number: "ST", name: "Stouffville" },
  { id: "up-express", number: "UP", name: "UP Express" },
];

type MobileLegendImpact = {
  count: number;
  kind: ImpactKind;
  label: string;
};

type MobileLegendTone = "affected" | "good";

function networkLineId(lineId: string, isRegional: boolean) {
  if (!isRegional) return lineId;
  return lineId === "up-express"
    ? "regional-up"
    : `regional-${lineId.replace("go-", "")}`;
}

function MobileLegendRouteBadge({
  lineId,
  lineNumber,
  tone,
  expanded,
  regional,
}: {
  lineId: string;
  lineNumber: string;
  tone: MobileLegendTone;
  expanded: boolean;
  regional: boolean;
}) {
  const sizeClass = expanded ? "mobile-legend-route-badge--expanded" : "mobile-legend-route-badge--compact";
  const networkClass = regional ? "mobile-legend-route-badge--regional" : "mobile-legend-route-badge--ttc";
  const badgeColors = transitLineBadgeColors(lineId);
  const badgeStyle = regional
    ? undefined
    : {
        "--mobile-legend-badge-fill-color": badgeColors.backgroundColor,
        "--mobile-legend-badge-number-color": badgeColors.color,
      } as CSSProperties;

  return (
    <span
      className={`mobile-legend-route-badge ${sizeClass} ${networkClass} service-tone-${tone}`}
      style={badgeStyle}
      aria-hidden="true"
    >
      {regional ? (
        <TransitLineBadge
          lineId={lineId}
          lineNumber={lineNumber}
          size={24}
          className="shrink-0"
          decorative
        />
      ) : (
        <span className="mobile-legend-route-number">{lineNumber}</span>
      )}
    </span>
  );
}

export function MobileLegend({
  mode = "ttc",
  expanded = false,
  onToggleExpanded,
  onLineClick,
}: {
  mode?: "ttc" | "regional";
  closingSoon?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onLineClick?: (lineId: string) => void;
}) {
  const legendRef = useRef<HTMLDivElement>(null);
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  const isRegional = mode === "regional";
  const lines = isRegional ? REGIONAL_LINES : TTC_LINES;
  const lineSummaries = lines.map((line) => {
    const dataLineId = networkLineId(line.id, isRegional);
    const impacts: MobileLegendImpact[] = [];
    const alertCount = activeAlerts.filter((impact) => impact.lineId === dataLineId).length;
    const delayCount = delays.filter((impact) => impact.lineId === dataLineId).length;
    const zoneCount = isRegional
      ? 0
      : countReducedSpeedZones(reducedSpeedZones.filter((impact) => impact.lineId === dataLineId));
    const closureCount = plannedClosures.filter((impact) => impact.lineId === dataLineId).length;
    const tone: MobileLegendTone = alertCount + delayCount + zoneCount + closureCount > 0
      ? "affected"
      : "good";

    if (alertCount > 0) impacts.push({ count: alertCount, kind: "suspension", label: "active alert" });
    if (delayCount > 0) impacts.push({ count: delayCount, kind: "delay", label: "delay" });
    if (zoneCount > 0) impacts.push({ count: zoneCount, kind: "reduced-speed-zone", label: "reduced speed zone" });
    if (closureCount > 0) impacts.push({ count: closureCount, kind: "planned-closure", label: "planned closure" });

    return {
      ...line,
      dataLineId,
      impacts,
      totalCount: impacts.reduce((total, impact) => total + impact.count, 0),
      tone,
    };
  });
  const affectedLineCount = lineSummaries.filter((line) => line.totalCount > 0).length;
  const legendLabel = affectedLineCount === 0
    ? "Transit line legend, all lines have regular service"
    : `Transit line legend, ${affectedLineCount} ${affectedLineCount === 1 ? "line has" : "lines have"} service impacts`;
  const modifierClasses = `${
    isRegional ? "mobile-legend-pill--regional" : ""
  } ${expanded ? "mobile-legend-pill--expanded" : ""}`;

  useLayoutEffect(() => {
    const legend = legendRef.current;
    const shell = legend?.closest<HTMLElement>(".linewatch-shell");
    if (!legend || !shell) return;

    const publishHeight = () => {
      shell.style.setProperty("--mobile-map-legend-height", `${Math.ceil(legend.getBoundingClientRect().height)}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(legend);

    return () => {
      observer.disconnect();
      shell.style.removeProperty("--mobile-map-legend-height");
    };
  }, [expanded, mode]);

  return (
    <div
      ref={legendRef}
      data-map-chooser-keepout
      className={`mobile-legend-pill fixed left-4 bg-white/95 dark:bg-[#0a0c10]/95 border border-black/10 dark:border-white/10 rounded-xl shadow-xl overflow-hidden select-none md:hidden ${modifierClasses}`}
      style={{ zIndex: expanded ? 41 : 35 }}
    >
      {expanded ? (
        <>
          <div
            className="mobile-legend-heading cursor-pointer"
            onClick={onToggleExpanded}
          >
            <span>Service by line</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpanded?.();
              }}
              className="mobile-legend-collapse"
              aria-expanded="true"
              aria-label="Transit line legend"
              title="Collapse transit line legend"
            >
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          </div>
          <nav className="mobile-legend-line-list" aria-label="Service impacts by transit line">
            {lineSummaries.map((line) => {
              const impactDescription = line.impacts
                .map((impact) => `${impact.count} ${impact.label}${impact.count === 1 ? "" : "s"}`)
                .join(", ");
              return (
                <button
                  type="button"
                  key={line.id}
                  className={`mobile-legend-line-row service-tone-${line.tone}`}
                  onClick={() => onLineClick?.(line.dataLineId)}
                  aria-label={`View all service impacts for ${line.name}: ${impactDescription || "normal service"}`}
                >
                  <MobileLegendRouteBadge
                    lineId={line.id}
                    lineNumber={line.number}
                    tone={line.tone}
                    expanded
                    regional={isRegional}
                  />
                  <span className="mobile-legend-line-name">{line.name}</span>
                  <span className="mobile-legend-line-status" aria-hidden="true">
                    {line.totalCount > 0 ? (
                      <strong className="service-tone-affected">{line.totalCount}</strong>
                    ) : (
                      <span className="mobile-legend-regular-label">Normal</span>
                    )}
                  </span>
                  <ChevronRight className="mobile-legend-row-chevron" size={13} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        <button
          type="button"
          onClick={onToggleExpanded}
          className={`mobile-legend-collapsed-toggle ${modifierClasses}`}
          aria-expanded="false"
          aria-label="Transit line legend"
          title={legendLabel}
        >
          <span className="sr-only">{legendLabel}</span>
          {lineSummaries.map((line) => (
            <span key={line.id} className={`mobile-legend-compact-row service-tone-${line.tone}`} aria-hidden="true">
              <MobileLegendRouteBadge
                lineId={line.id}
                lineNumber={line.number}
                tone={line.tone}
                expanded={false}
                regional={isRegional}
              />
              <span className="mobile-legend-status-rib" />
            </span>
          ))}
        </button>
      )}
    </div>
  );
}
