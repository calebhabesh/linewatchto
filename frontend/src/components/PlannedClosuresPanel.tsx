"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { ArrowRight, Bus } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon, CommutePathPreviewCardBanner } from "./ImpactCardFields";
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
  const [sort, setSort] = useState<ImpactListSort>("soonest");
  const { viewMode, setViewMode } = useImpactListView();
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleClosures = useMemo(() => filterAndSortImpacts(plannedClosures, { lineId, query: effectiveQuery, sort: effectiveSort }), [plannedClosures, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(plannedClosures.map((closure) => closure.lineId))].sort(), [plannedClosures]);
  useScrollSelectedImpactCard(selection, "planned-closure");

  if (embedded && visibleClosures.length === 0) return null;

  const handleClosureClick = (closureId: string) => {
    const isActivating = !(selection?.kind === "planned-closure" && selection.id === closureId);
    if (!isActivating && onFocusMap) {
      onFocusMap();
      return;
    }
    onSelectImpact(
      isActivating ? { kind: "planned-closure", id: closureId } : null,
    );
    if (isActivating && onFocusMap) {
      onFocusMap();
    }
  };

  return (
    <section className={`panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl ${embedded ? "embedded-impact-panel" : ""}`}>
      <PanelHeader
        title="Planned Closures"
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
          noun="planned closures"
          totalCount={plannedClosures.length}
          visibleCount={visibleClosures.length}
          lineIds={lineIds}
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
            {plannedClosures.length === 0 ? "No Planned Closures" : "No planned closures match these filters"}
          </div>
        ) : (
          visibleClosures.map((closure) => {
            const isActive = selection?.kind === "planned-closure" && selection.id === closure.id;
            const activeAlert = activeAlerts.find(
              (alert) => alert.relatedPlannedClosureId === closure.id || (
                closure.activeNow && alert.id === closure.id
              ),
            );
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
                  title="Planned Closure"
                  locationFirst
                  details={<><p>{closure.title}</p><p>Direction: {closure.displayDirection || "Not reported"}</p><p>Started: <CompactImpactTimeValue timestamp={closure.startedAt} /></p></>}
                  location={closure.location}
                  facts={[
                    ...((closure.windowDates || closure.windowHours) ? [{ label: "Schedule", value: [closure.windowDates, closure.windowHours].filter(Boolean).map(value => formatClosureScheduleValue(value!)).join(" · "), emphasized: true }] : []),
                    {
                      column: 1,
                      label: specificWindowLabel ? listWindowHeading : "Closure Window",
                      emphasized: true,
                      value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : closure.window,
                    },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={closure.updatedAt} fallback={closure.updatedAgo} /> },
                  ]}
                  status={[closure.activeNow && "Active now", closure.nightly && "Nightly", closure.shuttle && "Shuttle"].filter(Boolean).join(" · ") || null}
                  active={isActive}
                  toneClassName="planned-closure-card-border"
                  onShowOnMap={() => handleClosureClick(closure.id)}
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
                <div className="impact-card-heading has-status-badges flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={closure.lineId} lineNumber={closure.lineNumber} />
                    {showImpactTypeIndicator ? <ImpactTypeIcon kind="planned-closure" size={17} className="line-impact-card-type-icon shrink-0" /> : null}
                    <div className="flex flex-col items-start min-w-0">
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                        {closure.title}
                      </strong>
                    </div>
                  </div>
                  <div className="impact-card-heading__badges flex flex-col items-end gap-1 shrink-0 mt-0.5">
                    {closure.nightly && (
                      <span className="flex items-center gap-1 text-[10px] bg-slate-500/10 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-500/20 dark:border-white/15 px-1.5 py-0.5 rounded font-semibold uppercase">
                        Nightly
                      </span>
                    )}
                    {closure.shuttle && (
                      <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold uppercase">
                        <Bus size={10} />
                        Shuttle
                      </span>
                    )}
                  </div>
                </div>

                <ImpactRouteHeader location={closure.location} direction={closure.displayDirection} />
                
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                  {closure.description}
                </p>

                <OverlappingImpactRefs
                  overlaps={overlappingImpacts}
                  onSelectImpact={onSelectImpact}
                  label="Overlap:"
                />

                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                  <div className="flex-1 min-w-0">
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
                          label: "Closure dates",
                          value: closure.windowDates
                            ? formatClosureScheduleValue(closure.windowDates)
                            : null,
                        },
                        {
                          label: "Closure hours",
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
                          label: "Closure window",
                          value: hasScheduleDetails ? null : closure.window,
                        },
                      ]}
                      trailingRows={[
                        {
                          label: "Status",
                          value: activeAlert ? (
                            <button
                              type="button"
                              className="planned-closure-status-button"
                              onClick={() => onSelectImpact({ kind: "suspension", id: activeAlert.id })}
                              aria-label="View active alert"
                            >
                              <ImpactTypeIcon kind="suspension" size={13} />
                              <span>Active Now</span>
                              <ArrowRight size={13} aria-hidden="true" />
                            </button>
                          ) : (
                            <span className="planned-closure-status-inactive">
                              Currently Inactive
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClosureClick(closure.id)}
                    className={`impact-card-map-btn shrink-0 ${isActive ? "is-active" : ""}`}
                    aria-label={`${isActive && !onFocusMap ? "Unfocus" : "View on map"}: ${closure.title}`}
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
