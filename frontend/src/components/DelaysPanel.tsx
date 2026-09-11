"use client";

import { useMemo, useState } from "react";
import { PanelHeader } from "./PanelHeader";
import type { ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { ImpactRouteHeader, LineBadge, MetadataGrid, CardSource, JumpToLocationIcon, CommutePathPreviewCardBanner } from "./ImpactCardFields";
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

export function DelaysPanel({
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
  const [sort, setSort] = useState<ImpactListSort>("updated");
  const { viewMode, setViewMode } = useImpactListView();
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleDelays = useMemo(() => filterAndSortImpacts(delays, { lineId, query: effectiveQuery, sort: effectiveSort }), [delays, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(delays.map((delay) => delay.lineId))].sort(), [delays]);
  useScrollSelectedImpactCard(selection, "delay");

  if (embedded && visibleDelays.length === 0) return null;

  const handleDelayClick = (delayId: string) => {
    const isActivating = !(selection?.kind === "delay" && selection.id === delayId);
    if (!isActivating && onFocusMap) {
      onFocusMap();
      return;
    }
    onSelectImpact(
      isActivating ? { kind: "delay", id: delayId } : null,
    );
    if (isActivating && onFocusMap) {
      onFocusMap();
    }
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
            const isActive = selection?.kind === "delay" && selection.id === delay.id;
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: "delay", id: delay.id, segmentIds: delay.affectedSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );
            if (viewMode === "list") {
              return (
                <CompactImpactListItem
                  key={delay.id}
                  impactId={delay.id}
                  lineId={delay.lineId}
                  lineNumber={delay.lineNumber}
                  title={delay.title}
                  location={delay.location}
                  direction={delay.displayDirection}
                  facts={[
                    { column: 1, label: "Cause", value: delay.cause || "Service delay" },
                    { column: 2, label: "Started", value: <CompactImpactTimeValue timestamp={delay.startedAt} /> },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={delay.updatedAt} /> },
                  ]}
                  active={isActive}
                  toneClassName="delay-card-border"
                  onShowOnMap={() => handleDelayClick(delay.id)}
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
                <div className="impact-card-heading flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={delay.lineId} lineNumber={delay.lineNumber} />
                    {showImpactTypeIndicator ? <ImpactTypeIcon kind="delay" size={17} className="line-impact-card-type-icon shrink-0" /> : null}
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                      {delay.title}
                    </strong>
                  </div>
                </div>

                <ImpactRouteHeader location={delay.location} direction={delay.displayDirection} />

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                  {delay.description}
                </p>

                <OverlappingImpactRefs
                  overlaps={overlappingImpacts}
                  onSelectImpact={onSelectImpact}
                  label="Overlap:"
                />

                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                  <div className="flex-1 min-w-0">
                    <MetadataGrid
                      className="no-border"
                      cause={delay.cause}
                      startedAt={delay.startedAt}
                      updatedAt={delay.updatedAt}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelayClick(delay.id)}
                    className={`impact-card-map-btn shrink-0 ${isActive ? "is-active" : ""}`}
                    aria-label={`${isActive && !onFocusMap ? "Unfocus" : "View on map"}: ${delay.title}`}
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
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
