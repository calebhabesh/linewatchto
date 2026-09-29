"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { ArrowRight, Bus } from "lucide-react";
import { serviceEffectLabel } from "../app/alert-categories";
import { PanelHeader } from "./PanelHeader";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { MetadataGrid, CardSource, CommutePathPreviewCardBanner, ImpactCardShell } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { dashboardImpactSourcesLabel } from "../app/dashboard-source-label";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";

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

function formatClosureScheduleValue(value: string) {
  const normalized = value
    .replace(/\s*[–—]\s*/g, " – ")
    .replace(/\s+-\s+/g, " – ");

  return normalized
    .split(" – ")
    .map((part) =>
      part
        .replace(/([A-Za-z]{3},?)\s+([A-Za-z]{3})\s+(\d{1,2})/g, "$1\u00A0$2\u00A0$3")
        .replace(/([A-Za-z]{3})\s+(\d{1,2})/g, "$1\u00A0$2")
        .replace(/\s+·/g, "\u00A0·")
        .replace(/·\s+/g, "·\u00A0")
        .replace(/([A-Za-z]{3})\s+(\d{1,2}:\d{2})/g, "$1\u00A0$2")
        .replace(/(\d{1,2}:\d{2})\s+([AP]M)/g, "$1\u00A0$2")
    )
    .join(" – ");
}

export function PlannedClosuresPanel({
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
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts, stations } = dashboard;
  const [lineId, setLineId] = useState(initialLineId ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ImpactListSort>("soonest");
  const { viewMode, setViewMode } = useImpactListView();
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleClosures = useMemo(() => filterAndSortImpacts(plannedClosures, { lineId, query: effectiveQuery, sort: effectiveSort }), [plannedClosures, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(plannedClosures.map((closure) => closure.lineId))].sort(), [plannedClosures]);
  useScrollSelectedImpactCard(selection, "planned-closure");

  if (embedded && visibleClosures.length === 0) return null;

  const handleClosureClick = (closureId: string) => {
    onSelectImpact({ kind: "planned-closure", id: closureId });
    onFocusMap?.();
  };

  return (
    <section className={`panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl ${embedded ? "embedded-impact-panel" : ""}`}>
      <PanelHeader
        title="Planned Advisories"
        titleCompact
        icon={<PlannedClosureIcon size={20} className="w-5 h-5 text-blue-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
        metadata={
          <>
            <span className="panel-header-badge closure-count-badge shrink-0">
              {plannedClosures.length} {plannedClosures.length === 1 ? "Notice" : "Notices"}
            </span>
            <CardSource source={dashboardImpactSourcesLabel(dashboard, plannedClosures.map((closure) => closure.source))} />
          </>
        }
      />
      {plannedClosures.length > 0 ? (
        <ImpactListToolbar
          noun="planned advisories"
          totalCount={plannedClosures.length}
          visibleCount={visibleClosures.length}
          lineIds={lineIds}
          lineCounts={Object.fromEntries(lineIds.map((id) => [id, filterAndSortImpacts(plannedClosures, { lineId: id, query: effectiveQuery, sort: effectiveSort }).length]))}
          lineId={lineId}
          onLineIdChange={setLineId}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "soonest", label: "Soonest" },
            { value: "updated", label: "Updated" },
            { value: "line", label: "Line" },
            { value: "location", label: "Location" },
          ]}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      ) : null}
      <div className={`closure-stack min-w-0 p-3 flex flex-col gap-2 ${viewMode === "list" ? "is-list-view" : ""} ${visibleClosures.length === 0 ? "is-empty" : ""}`}>
        {visibleClosures.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {plannedClosures.length === 0 ? "No Planned Advisories" : "No planned advisories match these filters"}
          </div>
        ) : (
          visibleClosures.map((closure) => {
            const isActive = selection?.kind === "planned-closure" && selection.id === closure.id;
            const hasMapTarget = closure.previewSegmentIds.some((id) => networkSegments.some((segment) => segment.id === id))
              || (closure.previewStationIds ?? []).some((id) => stations.some((station) => station.id === id));
            const activeAlert = activeAlerts.find(
              (alert) => alert.relatedPlannedClosureId === closure.id || (
                closure.activeNow && alert.id === closure.id
              ),
            );
            const activeDelay = delays.find(delay => delay.relatedPlannedClosureId === closure.id || (closure.activeNow && delay.id === closure.id));
            const currentImpact = activeDelay ?? activeAlert;
            const currentKind = activeDelay ? "delay" : "suspension";
            const specificWindowLabel = closure.activeNow
              ? closure.activeWindowLabel
              : closure.nextWindowLabel;
            const specificWindowHeading = closure.activeNow ? "Current window" : "Next window";
            const hasScheduleDetails = Boolean(
              closure.windowHours || closure.windowDates || specificWindowLabel,
            );
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: "planned-closure", id: closure.id, segmentIds: closure.previewSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );
            if (viewMode === "list") {
              const listWindowHeading = closure.activeNow ? "Current" : "Next";
              return (
                <CompactImpactListItem
                  hideTypeLabel={!showImpactTypeIndicator}
                  key={closure.id}
                  impactId={closure.id}
                  lineId={closure.lineId}
                  lineNumber={closure.lineNumber}
                  title={serviceEffectLabel(closure, true)}
                  locationFirst
                  details={<><p>{closure.title}</p><p>Direction: {closure.displayDirection || "Not reported"}</p><p>Started: <CompactImpactTimeValue timestamp={closure.startedAt} /></p></>}
                  location={closure.location}
                  facts={[
                    ...((closure.windowDates || closure.windowHours) ? [{ label: "Schedule", value: [closure.windowDates, closure.windowHours].filter(Boolean).map(value => formatClosureScheduleValue(value!)).join(" · "), emphasized: true }] : []),
                    {
                      column: 1,
                      label: specificWindowLabel ? listWindowHeading : "Advisory Window",
                      emphasized: true,
                      value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : closure.window,
                    },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={closure.updatedAt} fallback={closure.updatedAgo} /> },
                  ]}
                  status={[closure.activeNow && "Active now", closure.nightly && "Nightly", closure.shuttle && "Shuttle"].filter(Boolean).join(" · ") || null}
                  active={isActive}
                  toneClassName="planned-closure-card-border"
                  onShowOnMap={isActive && onReturnToMap ? onReturnToMap : () => handleClosureClick(closure.id)}
                  mapUnavailable={!hasMapTarget}
                  mapActionLabel={isActive && onReturnToMap ? "Back" : "Map"}
                />
              );
            }
            return (
              <div
                key={closure.id}
                data-impact-card-id={closure.id}
                className={`closure-card planned-closure-card-border min-w-0 p-3 rounded-lg transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950 is-active" : ""
                }`}
              >
                <ImpactCardShell
                  lineId={closure.lineId}
                  lineNumber={closure.lineNumber}
                  title={closure.title}
                  description={closure.description}
                  location={closure.location}
                  direction={closure.displayDirection}
                  isMapActive={isActive}
                  onReturnToMap={onReturnToMap}
                  onMapAction={() => handleClosureClick(closure.id)}
                  mapActionLabel={isActive && onReturnToMap ? "Back" : "Map"}
                  mapUnavailable={!hasMapTarget}
                  onFocusMap={onFocusMap}
                  mapActionVariant={mapActionVariant}
                  badges={(
                    <>
                      {currentImpact ? (
                        <button
                          type="button"
                          className={`planned-closure-status-button ${currentKind === "delay" ? "is-delay" : ""}`}
                          onClick={() => onSelectImpact({ kind: currentKind, id: currentImpact.id })}
                          aria-label="View current impact"
                        >
                          <ImpactTypeIcon kind={currentKind} size={13} />
                          <span>Active Now</span>
                          <ArrowRight size={13} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className={`planned-closure-status-inactive ${closure.activeNow ? "is-inactive" : "is-upcoming"}`}>
                          {closure.activeNow ? "Currently Inactive" : "Upcoming"}
                        </span>
                      )}
                      {(showImpactTypeIndicator || closure.serviceEffect === "limited-service") ? (
                        <span className="impact-card-type-badge planned-closure">
                          <ImpactTypeIcon kind="planned-closure" size={13} />
                          {serviceEffectLabel(closure, true)}
                        </span>
                      ) : null}
                      {closure.nightly ? (
                        <span className="impact-card-service-badge nightly">Nightly</span>
                      ) : null}
                      {closure.shuttle ? (
                        <span className="impact-card-service-badge shuttle">
                          <Bus size={11} />
                          Shuttle
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
                    className="no-border planned-closure-metadata"
                    cause={closure.cause}
                    resolution={closure.resolution}
                    reason={closure.reason}
                    targetRemoval={closure.targetRemoval}
                    startedAt={closure.startedAt}
                    updatedAt={closure.updatedAt}
                    updatedAgo={closure.updatedAgo}
                    leadingRows={[
                      {
                        label: "Advisory dates",
                        value: closure.windowDates
                          ? formatClosureScheduleValue(closure.windowDates)
                          : null,
                      },
                      {
                        label: "Advisory hours",
                        value: closure.windowHours
                          ? formatClosureScheduleValue(closure.windowHours)
                          : null,
                      },
                      {
                        label: specificWindowHeading,
                        value: specificWindowLabel
                          ? formatClosureScheduleValue(specificWindowLabel)
                          : null,
                      },
                      {
                        label: "Advisory window",
                        value: hasScheduleDetails ? null : closure.window,
                      },
                    ]}
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
