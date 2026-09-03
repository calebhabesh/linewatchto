"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { DirectionalZoneCount } from "./DirectionalZoneCount";
import { Construction, ChevronLeft, X } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon, CommutePathPreviewCardBanner } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { dashboardImpactSourcesLabel } from "../app/dashboard-source-label";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { reducedSpeedZoneResolutionEntries, reducedSpeedZoneResolutionText } from "../app/reduced-speed-zone-resolution";
import { ReducedSpeedZoneResolutionBreakdown } from "./ReducedSpeedZoneResolutionBreakdown";
import { reducedSpeedZoneTimingEntries } from "../app/reduced-speed-zone-timing";
import { ReducedSpeedZoneTimingBreakdown } from "./ReducedSpeedZoneTimingBreakdown";

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
  embedded?: boolean;
  externalQuery?: string;
  externalSort?: ImpactListSort;
  showImpactTypeIndicator?: boolean;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
}

export function ReducedSpeedZonesPanel({
  selection,
  onSelectImpact,
  onBack,
  onClose,
  onFocusMap,
  initialLineId,
  embedded = false,
  externalQuery,
  externalSort,
  showImpactTypeIndicator = false,
  commutePathPreview,
  onClearCommutePathPreview,
}: Props) {
  const dashboard = useDashboardData();
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts } = dashboard;
  const [lineId, setLineId] = useState(initialLineId ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ImpactListSort>("line");
  const { viewMode, setViewMode } = useImpactListView();
  const zoneCount = countReducedSpeedZones(reducedSpeedZones);
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleZones = useMemo(() => filterAndSortImpacts(reducedSpeedZones, { lineId, query: effectiveQuery, sort: effectiveSort }), [reducedSpeedZones, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(reducedSpeedZones.map((zone) => zone.lineId))].sort(), [reducedSpeedZones]);
  useScrollSelectedImpactCard(selection, "reduced-speed-zone");

  if (embedded && visibleZones.length === 0) return null;

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
    <section className={`panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl ${embedded ? "embedded-impact-panel" : ""}`}>
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
              {zoneCount} {zoneCount === 1 ? "Zone" : "Zones"}
              {zoneCount !== reducedSpeedZones.length ? ` · ${reducedSpeedZones.length} Locations` : ""}
            </span>
            <CardSource source={dashboardImpactSourcesLabel(dashboard, reducedSpeedZones.map((zone) => zone.source))} />
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
            const zonesAtLocation = countReducedSpeedZones([zone]);
            const resolutionEntries = reducedSpeedZoneResolutionEntries(zone);
            const isGroupedZone = zonesAtLocation > 1;
            const showResolutionBreakdown = zonesAtLocation > 1 && resolutionEntries.length > 0;
            const showStartedBreakdown = reducedSpeedZoneTimingEntries(zone, "startedAt").length > 0;
            const showUpdatedBreakdown = reducedSpeedZoneTimingEntries(zone, "updatedAt").length > 0;
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
                    { column: 1, label: "Reduced Speed", value: formatSpeed(zone.reducedSpeed) || "Not Reported" },
                    ...(zonesAtLocation > 1 ? [{ column: 2, label: "Zone Count", value: zonesAtLocation }] : []),
                    {
                      column: 3,
                      label: "Started",
                      value: showStartedBreakdown
                        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="startedAt" />
                        : <CompactImpactTimeValue timestamp={zone.startedAt} />,
                    },
                    {
                      column: 4,
                      label: "Updated",
                      value: showUpdatedBreakdown
                        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="updatedAt" />
                        : <CompactImpactTimeValue timestamp={zone.updatedAt} fallback={zone.updatedAgo} />,
                    },
                    { column: 5, label: "Est. Resolution", value: reducedSpeedZoneResolutionText(zone) },
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
                className={`alert-card rsz-card-border min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-2 shadow-[inset_2px_0_6px_-2px_rgba(245,158,11,0.2)] !bg-slate-50 dark:!bg-[#12151c] transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
                }`}
              >
                <div className="impact-card-heading flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={zone.lineId} lineNumber={zone.lineNumber} />
                    {showImpactTypeIndicator ? <ImpactTypeIcon kind="reduced-speed-zone" size={17} className="line-impact-card-type-icon shrink-0" /> : null}
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
                      resolution={isGroupedZone ? null : zone.resolution}
                      reason={zone.reason} 
                      targetRemoval={isGroupedZone ? null : zone.targetRemoval}
                      startedAt={zone.startedAt}
                      updatedAt={zone.updatedAt}
                      updatedAgo={zone.updatedAgo} 
                      startedValue={showStartedBreakdown
                        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="startedAt" />
                        : undefined}
                      updatedValue={showUpdatedBreakdown
                        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="updatedAt" />
                        : undefined}
                      extraRows={[
                        { label: "Reduced Speed", value: formatSpeed(zone.reducedSpeed) },
                        {
                          label: "Zone Count",
                          labelSuffix: (
                            <>
                              <span className="rsz-zone-count-label-separator"> - </span>
                              <span className="rsz-zone-count-label-total">{zonesAtLocation}</span>
                            </>
                          ),
                          value: zonesAtLocation > 1 ? <DirectionalZoneCount zone={zone} /> : null,
                        },
                        ...(isGroupedZone ? [{
                          label: "Est. Resolution",
                          value: showResolutionBreakdown
                            ? <ReducedSpeedZoneResolutionBreakdown zone={zone} />
                            : reducedSpeedZoneResolutionText(zone),
                        }] : [{ label: "Typical Speed", value: formatSpeed(zone.averageSpeed) }]),
                      ]}
                      trailingRows={isGroupedZone
                        ? [{ label: "Typical Speed", value: formatSpeed(zone.averageSpeed) }]
                        : undefined}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReducedSpeedZoneClick(zone.id)}
                    className={`impact-card-map-btn shrink-0 ${isActive ? "is-active" : ""}`}
                    aria-label={`${isActive && !onFocusMap ? "Unfocus" : "View on map"}: ${zone.title}`}
                    title={isActive && !onFocusMap ? "Unfocus" : "View on Map"}
                  >
                    <JumpToLocationIcon className="w-8 h-8" />
                    <span>
                      {isActive && !onFocusMap ? "Unfocus" : "View on Map"}
                    </span>
                  </button>
                </div>

                {isActive && commutePathPreview ? (
                  <CommutePathPreviewCardBanner
                    commutePathPreview={commutePathPreview}
                    onClearCommutePathPreview={onClearCommutePathPreview}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
