"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { ArrowRight, Bus, ChevronLeft, X } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon, CommutePathPreviewCardBanner } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { dashboardImpactSourceLabel } from "../app/dashboard-source-label";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
  onFocusMap?: () => void;
  initialLineId?: string | null;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
}

function formatClosureScheduleValue(value: string) {
  return value
    .replace(/\s*[–—]\s*/g, " – ")
    .replace(/\s+-\s+/g, " – ");
}

export function PlannedClosuresPanel({
  selection,
  onSelectImpact,
  onBack,
  onClose,
  onFocusMap,
  initialLineId,
  commutePathPreview,
  onClearCommutePathPreview,
}: Props) {
  const dashboard = useDashboardData();
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts } = dashboard;
  const [lineId, setLineId] = useState(initialLineId ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ImpactListSort>("soonest");
  const { viewMode, setViewMode } = useImpactListView();
  const visibleClosures = useMemo(() => filterAndSortImpacts(plannedClosures, { lineId, query, sort }), [plannedClosures, lineId, query, sort]);
  const lineIds = useMemo(() => [...new Set(plannedClosures.map((closure) => closure.lineId))].sort(), [plannedClosures]);
  useScrollSelectedImpactCard(selection, "planned-closure");

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
            <PlannedClosureIcon className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-blue-500 shrink-0" />
            <span>Planned Closures</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1 mt-0.5 min-w-0">
            <span className="shrink-0 text-[9px] sm:text-xs bg-blue-500/10 text-blue-500 px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
              {plannedClosures.length} {plannedClosures.length === 1 ? "Notice" : "Notices"}
            </span>
            <CardSource source={dashboardImpactSourceLabel(dashboard, plannedClosures[0]?.source)} />
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
              const listWindowHeading = closure.activeNow ? "Current Window" : "Next Window";
              return (
                <CompactImpactListItem
                  key={closure.id}
                  impactId={closure.id}
                  lineId={closure.lineId}
                  lineNumber={closure.lineNumber}
                  title={closure.title}
                  location={closure.location}
                  direction={closure.displayDirection}
                  facts={[
                    {
                      column: 1,
                      label: specificWindowLabel ? listWindowHeading : "Closure Window",
                      value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : closure.window,
                    },
                    { column: 2, label: "Started", value: <CompactImpactTimeValue timestamp={closure.startedAt} /> },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={closure.updatedAt} fallback={closure.updatedAgo} /> },
                  ]}
                  status={closure.activeNow ? "Active now" : closure.nightly ? "Nightly" : closure.shuttle ? "Shuttle" : null}
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
                className={`closure-card planned-closure-card-border min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/10 dark:border-white/10 border-l-4 transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950" : ""
                }`}
              >
                <div className="impact-card-heading has-status-badges flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={closure.lineId} lineNumber={closure.lineNumber} />
                    <div className="flex flex-col items-start min-w-0">
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                        {closure.title}
                      </strong>
                    </div>
                  </div>
                  <div className="impact-card-heading__badges flex flex-col items-end gap-1 shrink-0 mt-0.5">
                    {closure.nightly && (
                      <span className="flex items-center gap-1 text-[10px] bg-slate-500/10 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold uppercase">
                        Nightly
                      </span>
                    )}
                    {closure.shuttle && (
                      <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
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
