"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { DirectionalZoneCount } from "./DirectionalZoneCount";
import { Construction } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { MetadataGrid, CardSource, CommutePathPreviewCardBanner, ImpactCardShell } from "./ImpactCardFields";
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
  mapActionVariant?: "icon-only" | "labeled";
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
  mapActionVariant,
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
    onSelectImpact(
      isActivating ? { kind: "reduced-speed-zone", id: alertId } : null,
    );
    if (isActivating && onFocusMap) {
      onFocusMap();
    }
  };

  return (
    <section className={`panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl ${embedded ? "embedded-impact-panel" : ""}`}>
      <PanelHeader
        title="Reduced Speed Zones"
        titleCompact
        icon={<Construction className="rsz-tone w-5 h-5 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
        metadata={
          <>
            <span className="rsz-count-badge shrink-0">
              {zoneCount} {zoneCount === 1 ? "Zone" : "Zones"}
              {zoneCount !== reducedSpeedZones.length ? ` · ${reducedSpeedZones.length} Locations` : ""}
            </span>
            <CardSource source={dashboardImpactSourcesLabel(dashboard, reducedSpeedZones.map((zone) => zone.source))} />
          </>
        }
      />
      {reducedSpeedZones.length > 0 ? (
        <ImpactListToolbar
          noun="Reduced Speed Zones"
          totalCount={reducedSpeedZones.length}
          visibleCount={visibleZones.length}
          lineIds={lineIds}
          lineCounts={Object.fromEntries(lineIds.map((id) => [id, countReducedSpeedZones(filterAndSortImpacts(reducedSpeedZones, { lineId: id, query: effectiveQuery, sort: effectiveSort }))]))}
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
                  hideTypeLabel={!showImpactTypeIndicator}
                  key={zone.id}
                  impactId={zone.id}
                  lineId={zone.lineId}
                  lineNumber={zone.lineNumber}
                  title={zone.title}
                  location={zone.location}
                  locationFirst
                  facts={[
                    { label: "Speed", value: formatSpeed(zone.reducedSpeed) || "Not Reported" },
                    { column: 2, label: "Directions", value: <DirectionalZoneCount zone={zone} /> },
                    { label: "Updated", value: showUpdatedBreakdown
                      ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="updatedAt" />
                      : <CompactImpactTimeValue timestamp={zone.updatedAt} fallback={zone.updatedAgo} /> },
                    { label: "Est. Resolution", value: showResolutionBreakdown
                      ? <ReducedSpeedZoneResolutionBreakdown zone={zone} />
                      : (reducedSpeedZoneResolutionText(zone) || "TBD") },
                  ]}
                  details={<MetadataGrid
                    startedAt={zone.startedAt}
                    updatedAt={zone.updatedAt}
                    updatedAgo={zone.updatedAgo}
                    startedValue={showStartedBreakdown ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="startedAt" /> : undefined}
                    updatedValue={showUpdatedBreakdown ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="updatedAt" /> : undefined}
                    extraRows={[{label: "Est. Resolution", value: showResolutionBreakdown ? <ReducedSpeedZoneResolutionBreakdown zone={zone} /> : reducedSpeedZoneResolutionText(zone)}]}
                  />}
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
                className={`alert-card rsz-card-border min-w-0 w-full text-left p-3 rounded-lg transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950 is-active" : ""
                }`}
              >
                <ImpactCardShell
                  lineId={zone.lineId}
                  lineNumber={zone.lineNumber}
                  lineBadgeSize={34}
                  title={zone.title}
                  showNarrative={false}
                  location={zone.location}
                  direction={zone.displayDirection}
                  isMapActive={isActive}
                  onMapAction={() => handleReducedSpeedZoneClick(zone.id)}
                  onFocusMap={onFocusMap}
                  mapActionVariant={mapActionVariant}
                  badges={showImpactTypeIndicator ? (
                    <span className="impact-card-type-badge reduced-speed-zone">
                      <ImpactTypeIcon kind="reduced-speed-zone" size={13} />
                      Reduced speed zone
                    </span>
                  ) : undefined}
                  overlaps={(
                    <OverlappingImpactRefs
                      overlaps={overlappingImpacts}
                      onSelectImpact={onSelectImpact}
                      label="Overlapping impacts"
                    />
                  )}
                />

                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 w-full min-w-0">
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
