"use client";

import { useMemo, useState } from "react";
import { serviceEffectLabel } from "../app/alert-categories";
import { suppliedAlertCause } from "../app/alert-cause";
import { PanelHeader } from "./PanelHeader";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { MetadataGrid, CardSource, RelatedPlannedClosureButton, CommutePathPreviewCardBanner, ImpactCardShell } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { dashboardImpactSourcesLabel } from "../app/dashboard-source-label";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onSelectRelatedImpact?: (selection: ImpactSelection) => void;
  onReturnToMap?: () => void;
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

export function DelaysPanel({
  selection,
  onSelectImpact,
  onSelectRelatedImpact = onSelectImpact,
  onReturnToMap,
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
  const [sort, setSort] = useState<ImpactListSort>("updated");
  const { viewMode, setViewMode } = useImpactListView();
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleDelays = useMemo(() => filterAndSortImpacts(delays, { lineId, query: effectiveQuery, sort: effectiveSort }), [delays, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(delays.map((delay) => delay.lineId))].sort(), [delays]);
  useScrollSelectedImpactCard(selection, "delay");

  if (embedded && visibleDelays.length === 0) return null;

  const handleDelayClick = (delayId: string) => {
    onSelectImpact({ kind: "delay", id: delayId });
    onFocusMap?.();
  };

  return (
    <section className={`panel min-w-0 border border-transparent rounded-2xl ${embedded ? "embedded-impact-panel" : ""}`}>
      <PanelHeader
        title="Delays"
        icon={<DelayIcon size={20} className="delay-tone w-5 h-5 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
        metadata={
          <>
            <span className="delay-count-badge shrink-0">
              {delays.length} {delays.length === 1 ? "Delay" : "Delays"}
            </span>
            <CardSource source={dashboardImpactSourcesLabel(dashboard, delays.map((delay) => delay.source))} />
          </>
        }
      />
      {delays.length > 0 ? (
        <ImpactListToolbar
          noun="delays"
          totalCount={delays.length}
          visibleCount={visibleDelays.length}
          lineIds={lineIds}
          lineCounts={Object.fromEntries(lineIds.map((id) => [id, filterAndSortImpacts(delays, { lineId: id, query: effectiveQuery, sort: effectiveSort }).length]))}
          lineId={lineId}
          onLineIdChange={setLineId}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "updated", label: "Updated" },
            { value: "line", label: "Line" },
            { value: "location", label: "Location" },
          ]}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      ) : null}
      <div className={`alert-stack min-w-0 p-3 flex flex-col gap-2 ${viewMode === "list" ? "is-list-view" : ""} ${visibleDelays.length === 0 ? "is-empty" : ""}`}>
        {visibleDelays.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {delays.length === 0 ? "No Delays" : "No delays match these filters"}
          </div>
        ) : (
          visibleDelays.map((delay) => {
            const cause = suppliedAlertCause(delay.cause);
            const isActive = selection?.kind === "delay" && selection.id === delay.id;
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: "delay", id: delay.id, segmentIds: delay.affectedSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );
            if (viewMode === "list") {
              return (
                <CompactImpactListItem
                  hideTypeLabel={!showImpactTypeIndicator}
                  key={delay.id}
                  impactId={delay.id}
                  lineId={delay.lineId}
                  lineNumber={delay.lineNumber}
                  title={serviceEffectLabel(delay)}
                  details={<><p>{delay.title}</p>{delay.relatedPlannedClosureId ? <RelatedPlannedClosureButton onClick={() => onSelectRelatedImpact({ kind: "planned-closure", id: delay.relatedPlannedClosureId! })} /> : null}</>}
                  location={delay.location}
                  direction={delay.displayDirection}
                  facts={[
                    ...(cause ? [{ column: 1 as const, label: "Cause", value: cause }] : []),
                    { column: 2, label: "Started", value: <CompactImpactTimeValue timestamp={delay.startedAt} /> },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={delay.updatedAt} /> },
                  ]}
                  mapActionLabel={isActive && onReturnToMap ? "Back" : "Map"}
                  active={isActive}
                  toneClassName="delay-card-border"
                  onShowOnMap={isActive && onReturnToMap ? onReturnToMap : () => handleDelayClick(delay.id)}
                />
              );
            }
            return (
              <article
                key={delay.id}
                data-impact-card-id={delay.id}
                className={`alert-card delay-card-border min-w-0 w-full text-left p-3 rounded-lg transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950 is-active" : ""
                }`}
              >
                <ImpactCardShell
                  lineId={delay.lineId}
                  lineNumber={delay.lineNumber}
                  title={delay.title}
                  description={delay.description}
                  location={delay.location}
                  direction={delay.displayDirection}
                  isMapActive={isActive}
                  onReturnToMap={onReturnToMap}
                  onMapAction={() => handleDelayClick(delay.id)}
                  onFocusMap={onFocusMap}
                  mapActionVariant={mapActionVariant}
                  badges={(
                    <>
                      {delay.relatedPlannedClosureId ? (
                        <RelatedPlannedClosureButton onClick={() => onSelectRelatedImpact({ kind: "planned-closure", id: delay.relatedPlannedClosureId! })} />
                      ) : null}
                      {showImpactTypeIndicator ? (
                        <span className="impact-card-type-badge delay">
                          <ImpactTypeIcon kind="delay" size={13} />
                          {serviceEffectLabel(delay)}
                        </span>
                      ) : null}
                    </>
                  )}
                  overlaps={(
                    <OverlappingImpactRefs
                      overlaps={overlappingImpacts}
                      onSelectImpact={onSelectRelatedImpact}
                      label="Overlapping impacts"
                    />
                  )}
                />

                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 w-full min-w-0">
                  <MetadataGrid
                    className="no-border"
                    cause={delay.cause}
                    startedAt={delay.startedAt}
                    updatedAt={delay.updatedAt}
                  />
                </div>

                {isActive && commutePathPreview ? (
                  <CommutePathPreviewCardBanner
                    commutePathPreview={commutePathPreview}
                    onClearCommutePathPreview={onClearCommutePathPreview}
                  />
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
