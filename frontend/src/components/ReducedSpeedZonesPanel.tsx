"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { Construction, ChevronLeft, X } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { dashboardImpactSourceLabel } from "../app/dashboard-source-label";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";

const formatSpeed = (val: string | null | undefined): string | null => {
  if (!val) return null;
  return val.toLowerCase().includes("km/h") ? val : `${val} km/h`;
};

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
  onFocusMap?: () => void;
  initialLineId?: string | null;
}

export function ReducedSpeedZonesPanel({
  selection,
  onSelectImpact,
  onBack,
  onClose,
  onFocusMap,
  initialLineId,
}: Props) {
  const dashboard = useDashboardData();
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts } = dashboard;
  const [lineId, setLineId] = useState(initialLineId ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ImpactListSort>("line");
  const { viewMode, setViewMode } = useImpactListView();
  const visibleZones = useMemo(() => filterAndSortImpacts(reducedSpeedZones, { lineId, query, sort }), [reducedSpeedZones, lineId, query, sort]);
  const lineIds = useMemo(() => [...new Set(reducedSpeedZones.map((zone) => zone.lineId))].sort(), [reducedSpeedZones]);
  useScrollSelectedImpactCard(selection, "reduced-speed-zone");

  const handleReducedSpeedZoneClick = (alertId: string) => {
    const isActivating = !(selection?.kind === "reduced-speed-zone" && selection.id === alertId);
    if (!isActivating && onFocusMap) {
      onFocusMap();
      return;
    }
    onSelectImpact(
      isActivating ? { kind: "reduced-speed-zone", id: alertId } : null,
    );
    if (isActivating && onFocusMap) {
      onFocusMap();
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
            <Construction className="rsz-tone w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] shrink-0" />
            <span>Reduced Speed Zones</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1 mt-0.5 min-w-0">
            <span className="rsz-count-badge shrink-0 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
              {reducedSpeedZones.length} {reducedSpeedZones.length === 1 ? "Zone" : "Zones"}
            </span>
            <CardSource source={dashboardImpactSourceLabel(dashboard, reducedSpeedZones[0]?.source)} />
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
      {reducedSpeedZones.length > 0 ? (
        <ImpactListToolbar
          noun="Reduced Speed Zones"
          totalCount={reducedSpeedZones.length}
          visibleCount={visibleZones.length}
          lineIds={lineIds}
          lineId={lineId}
          onLineIdChange={setLineId}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "line", label: "Line" },
            { value: "updated", label: "Updated" },
            { value: "location", label: "Location" },
          ]}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      ) : null}
      <div className={`alert-stack min-w-0 p-3 flex flex-col gap-2 ${viewMode === "list" ? "is-list-view" : ""} ${visibleZones.length === 0 ? "is-empty" : ""}`}>
        {visibleZones.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {reducedSpeedZones.length === 0 ? "No Reduced Speed Zones" : "No Reduced Speed Zones match these filters"}
          </div>
        ) : (
          visibleZones.map((zone) => {
            const isActive = selection?.kind === "reduced-speed-zone" && selection.id === zone.id;
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: "reduced-speed-zone", id: zone.id, segmentIds: zone.affectedSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );
            if (viewMode === "list") {
              return (
                <CompactImpactListItem
                  key={zone.id}
                  impactId={zone.id}
                  lineId={zone.lineId}
                  lineNumber={zone.lineNumber}
                  title={zone.title}
                  location={zone.location}
                  direction={zone.displayDirection}
                  facts={[
                    { column: 1, label: "Reduced speed", value: formatSpeed(zone.reducedSpeed) || "Not reported" },
                    { column: 2, label: "Started", value: <CompactImpactTimeValue timestamp={zone.startedAt} /> },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={zone.updatedAt} fallback={zone.updatedAgo} /> },
                    { column: 4, label: "Est. resolution", value: zone.resolution || zone.targetRemoval || "TBD" },
                  ]}
                  active={isActive}
                  toneClassName="rsz-card-border"
                  onShowOnMap={() => handleReducedSpeedZoneClick(zone.id)}
                />
              );
            }
            return (
              <div
                key={zone.id}
                data-impact-card-id={zone.id}
                className={`alert-card rsz-card-border min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
                }`}
              >
                <div className="impact-card-heading flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={zone.lineId} lineNumber={zone.lineNumber} />
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                      {zone.title}
                    </strong>
                  </div>
                </div>

                <ImpactRouteHeader 
                  location={zone.location} 
                  direction={zone.displayDirection}
                />

                <OverlappingImpactRefs
                  overlaps={overlappingImpacts}
                  onSelectImpact={onSelectImpact}
                  label="Overlap:"
                />

                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                  <div className="flex-1 min-w-0">
                    <MetadataGrid 
                      className="no-border"
                      cause={zone.cause}
                      resolution={zone.resolution}
                      reason={zone.reason} 
                      targetRemoval={zone.targetRemoval} 
                      startedAt={zone.startedAt}
                      updatedAt={zone.updatedAt}
                      updatedAgo={zone.updatedAgo} 
                      extraRows={[
                        { label: "Reduced speed", value: formatSpeed(zone.reducedSpeed) },
                        { label: "Typical speed", value: formatSpeed(zone.averageSpeed) },
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReducedSpeedZoneClick(zone.id)}
                    className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? "bg-slate-600 text-white border-slate-700 hover:bg-slate-700 dark:bg-slate-500 dark:border-slate-600 dark:hover:bg-slate-400 shadow-[0_0_12px_rgba(100,116,139,0.3)]"
                        : "bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700"
                    }`}
                  >
                    <JumpToLocationIcon className="w-8 h-8" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight mt-1.5 max-w-[72px] whitespace-normal break-words">
                      {isActive && !onFocusMap ? "Unfocus" : "Show on Map"}
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
